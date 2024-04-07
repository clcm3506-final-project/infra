import { Construct } from 'constructs';
import { Tags } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface JenkinsProps {
  readonly prefix: string;
  readonly vpc: ec2.IVpc;
  readonly keyPairName?: string;
  readonly deploymentPolicyStatements: iam.PolicyStatement[];
}

export default class JenkinsInstance extends Construct {
  public readonly instance: ec2.Instance;
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: JenkinsProps) {
    super(scope, id);

    const { prefix, vpc, keyPairName, deploymentPolicyStatements } = props;

    // create security group for Jenkins instance
    this.securityGroup = new ec2.SecurityGroup(this, 'JenkinsSecurityGroup', {
      vpc: vpc,
      securityGroupName: `${prefix}-jenkins-sg`,
      allowAllOutbound: true,
    });

    this.securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8080),
      'Allow http 8080 access from anywhere',
    );

    Tags.of(this.securityGroup).add('Name', `${prefix}-jenkins-sg`);

    // create instance iam role
    const role = new iam.Role(this, 'JenkinsInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    deploymentPolicyStatements.forEach((statement) => {
      role.addToPolicy(statement);
    });

    // add SSM managed policy to the role
    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
    );

    // add policy statement to allow ec2 put SSM parameter
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:PutParameter'],
        resources: ['*'],
      }),
    );

    this.instance = new ec2.Instance(this, 'JenkinsInstance', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceName: `${prefix}-jenkins-instance`,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: this.securityGroup,
      keyPair: keyPairName ? ec2.KeyPair.fromKeyPairName(this, 'KeyPair', keyPairName) : undefined,
      role,
      userData: ec2.UserData.custom(
        `#!/bin/bash
yum update -y
wget -O /etc/yum.repos.d/jenkins.repo https://pkg.jenkins.io/redhat-stable/jenkins.repo
rpm --import https://pkg.jenkins.io/redhat-stable/jenkins.io-2023.key
yum upgrade -y
dnf install java-17-amazon-corretto -y
yum install jenkins -y
systemctl enable jenkins
systemctl start jenkins
yum install -y docker git
systemctl enable docker
systemctl start docker
usermod -aG docker $USER
mkdir -p /var/lib/jenkins/.ssh
ssh-keyscan -t ed25519 github.com >> /var/lib/jenkins/.ssh/known_hosts
chown -R jenkins:jenkins /var/lib/jenkins/.ssh
aws ssm put-parameter --name /jenkins/initialAdminPassword --value $(cat /var/lib/jenkins/secrets/initialAdminPassword) --type String --overwrite`,
      ),
    });
  }
}
