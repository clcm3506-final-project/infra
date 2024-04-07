import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Tags } from 'aws-cdk-lib';

export interface EcsProps {
  readonly prefix: string;
  readonly vpc?: ec2.IVpc;
  readonly ec2InstanceType?: string;
  readonly desiredCapacity?: number;
  readonly certificateArn: string;
}

export default class Ecs extends Construct {
  public readonly cluster: ecs.Cluster;
  public readonly loadBalancer: cdk.aws_elasticloadbalancingv2.NetworkLoadBalancer;
  public readonly taskDefinition: ecs.Ec2TaskDefinition;
  public readonly service: ecs.Ec2Service;
  public readonly taskRole: iam.Role;
  public readonly taskExecutionRole: iam.Role;
  public readonly deploymentPolicyStatements: iam.PolicyStatement[];

  constructor(scope: Construct, id: string, props?: EcsProps) {
    super(scope, id);

    if (!props || !props.prefix || !props.certificateArn) {
      throw new Error('props are required');
    }

    let { vpc, ec2InstanceType, desiredCapacity } = props;
    const { prefix, certificateArn } = props;

    // import certificate
    const certificate = cdk.aws_certificatemanager.Certificate.fromCertificateArn(
      this,
      'apiCertificate',
      certificateArn,
    );

    // if no props, set default values
    vpc = vpc || ec2.Vpc.fromLookup(this, 'Vpc', { isDefault: true });
    ec2InstanceType = ec2InstanceType || 't2.micro';
    desiredCapacity = desiredCapacity || 1;

    // Create an ECS cluster
    const cluster = new ecs.Cluster(this, 'Cluster', { vpc, clusterName: `${prefix}-cluster` });
    this.cluster = cluster;

    // Add ec2 capacity to it
    cluster.addCapacity('DefaultAutoScalingGroupCapacity', {
      instanceType: new ec2.InstanceType(ec2InstanceType),
      desiredCapacity,
    });

    // Create task execution role
    const executionRole = new iam.Role(this, 'TaskExecutionRole', {
      roleName: `${prefix}-task-execution-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    const loggingPolicy = new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    });

    // Add permissions to the role
    executionRole.addToPolicy(loggingPolicy);
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
        ],
        resources: ['*'],
      }),
    );

    // Create task role
    const taskRole = new iam.Role(this, 'TaskRole', {
      roleName: `${prefix}-task-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    taskRole.addToPolicy(loggingPolicy);

    this.taskRole = taskRole;
    this.taskExecutionRole = executionRole;

    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'TaskDef', {
      family: `${prefix}-task`,
      executionRole,
      taskRole,
    });

    this.taskDefinition = taskDefinition;

    // create log group
    const logGroup = new cdk.aws_logs.LogGroup(this, 'BackendLogGroup', {
      logGroupName: `${prefix}-backend-logs`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    taskDefinition.addContainer('backend', {
      image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      memoryLimitMiB: 128,
      portMappings: [{ containerPort: 80 }],
      logging: new ecs.AwsLogDriver({ streamPrefix: prefix, logGroup }),
    });

    // create a security group, allow inbound 80 from anywhere
    const loadBalancerSecurityGroup = new ec2.SecurityGroup(this, 'AllowTraffic', {
      vpc,
      allowAllOutbound: true,
      disableInlineRules: true,
    });

    Tags.of(loadBalancerSecurityGroup).add('Name', `${prefix}-load-balancer-sg`);

    loadBalancerSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'allow HTTP traffic from anywhere',
    );

    loadBalancerSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'allow HTTPS traffic from anywhere',
    );

    const loadBalancedEcsService = new ecsPatterns.NetworkLoadBalancedEc2Service(this, 'Service', {
      serviceName: `${prefix}-backend-service`,
      cluster,
      memoryLimitMiB: 128,
      listenerPort: 80,
      healthCheckGracePeriod: cdk.Duration.seconds(5),

      publicLoadBalancer: true,
      taskDefinition,
      desiredCount: 1,
    });

    this.loadBalancer = loadBalancedEcsService.loadBalancer;
    this.loadBalancer.addSecurityGroup(loadBalancerSecurityGroup);

    this.loadBalancer.addListener('HTTSListener', {
      port: 443,
      protocol: cdk.aws_elasticloadbalancingv2.Protocol.TLS,
      certificates: [certificate],
      defaultTargetGroups: [loadBalancedEcsService.targetGroup],
    });

    this.service = loadBalancedEcsService.service;

    loadBalancedEcsService.targetGroup.configureHealthCheck({
      interval: cdk.Duration.seconds(5),
      timeout: cdk.Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 5,
    });

    loadBalancedEcsService.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '5');

    cluster.connections.allowFrom(
      loadBalancerSecurityGroup,
      ec2.Port.allTcp(),
      'Allow inbound HTTP traffic from load balancer',
    );

    this.deploymentPolicyStatements = [
      new iam.PolicyStatement({
        sid: 'RegisterTaskDefinition',
        actions: ['ecs:RegisterTaskDefinition'],
        resources: ['*'],
      }),
      new iam.PolicyStatement({
        sid: 'PassRolesInTaskDefinition',
        actions: ['iam:PassRole'],
        resources: [taskRole.roleArn, executionRole.roleArn],
      }),
      new iam.PolicyStatement({
        sid: 'DeployService',
        actions: ['ecs:UpdateService', 'ecs:DescribeServices'],
        resources: [loadBalancedEcsService.service.serviceArn],
      }),
      new iam.PolicyStatement({
        sid: 'DescribeTaskDefinition',
        actions: [
          'ecs:DescribeTaskDefinition',
          'ecs:ListTasks',
          'ecs:DescribeTasks',
          'ecs:DescribeContainerInstances',
          'ec2:DescribeInstances',
        ],
        resources: ['*'],
      }),
      new iam.PolicyStatement({
        sid: 'PushImageToECR',
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
          'ecr:InitiateLayerUpload',
          'ecr:UploadLayerPart',
          'ecr:CompleteLayerUpload',
          'ecr:PutImage',
        ],
        resources: ['*'],
      }),
    ];

    // Output the DNS where you can access your service
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: this.loadBalancer.loadBalancerDnsName,
      description: 'Load balancer DNS',
      exportName: 'LoadBalancerDNS',
    });

    new cdk.CfnOutput(this, 'ClusterName', {
      value: cluster.clusterName,
      description: 'ECS cluster name',
      exportName: 'ClusterName',
    });

    new cdk.CfnOutput(this, 'ServiceName', {
      value: loadBalancedEcsService.service.serviceName,
      description: 'ECS service name',
      exportName: 'ServiceName',
    });
  }
}
