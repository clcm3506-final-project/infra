import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import Dynamodb from './storage/Dynamodb';
import Ecs from './compute/Ecs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import PipelineRoles from './iam/PipelineRoles';
import JenkinsInstance from './compute/Jenkins';

interface InfraStackProps extends cdk.StackProps {
  readonly prefix: string;
  readonly backendRepoPath: string;
  readonly frontendRepoPath: string;
  readonly certificateArn: string;
  readonly environment: string;
  readonly slackWebhookUrl: string;
}

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: InfraStackProps) {
    super(scope, id, props);

    if (
      !props ||
      !props.prefix ||
      !props.backendRepoPath ||
      !props.frontendRepoPath ||
      !props.certificateArn ||
      !props.environment
    ) {
      throw new Error('props are required');
    }

    const {
      prefix,
      environment,
      frontendRepoPath,
      backendRepoPath,
      certificateArn,
      slackWebhookUrl,
    } = props;

    // create DynamoDB tables
    const tables = new Dynamodb(this, 'Dynamodb', { environment, rcu: 2, wcu: 2 });

    // create ECR repository
    const repository = new cdk.aws_ecr.Repository(this, 'backendRepository', {
      repositoryName: `${prefix}-backend`,
      removalPolicy: environment === 'dev' ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
      autoDeleteImages: true,
    });

    // create ECS cluster
    const cluster = new Ecs(this, 'backend', { prefix, certificateArn, slackWebhookUrl });

    // grant ecr pull permissions to the ECS task execution role
    repository.grantPull(cluster.taskExecutionRole);

    // grant the ECS task role to read/write data from the DynamoDB tables
    tables.patientsTable.grantReadWriteData(cluster.taskRole);
    tables.recordsTable.grantReadWriteData(cluster.taskRole);

    // create s3 bucket to host static webiste
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `${prefix}-bucket`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true,
        blockPublicPolicy: false,
        ignorePublicAcls: true,
        restrictPublicBuckets: false,
      }),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // add bucket policy for s3:GetObject by anyone
    frontendBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [frontendBucket.bucketArn + '/*'],
        principals: [new iam.AnyPrincipal()],
      }),
    );

    // create roles for the pipeline
    new PipelineRoles(this, 'PipelineRoles', {
      prefix,
      deploymentPolicyStatements: cluster.deploymentPolicyStatements,
      backendRepoPath,
      frontendBucket,
      frontendRepoPath,
    });

    new JenkinsInstance(this, 'Jenkins', {
      prefix,
      vpc: cdk.aws_ec2.Vpc.fromLookup(this, 'Vpc', { isDefault: true }),
      keyPairName: 'ec2',
      deploymentPolicyStatements: cluster.deploymentPolicyStatements,
    });

    // output the repository uri
    new cdk.CfnOutput(this, 'repositoryUri', {
      value: repository.repositoryUri,
      description: 'Repository URI',
      exportName: 'repositoryUri',
    });
  }
}
