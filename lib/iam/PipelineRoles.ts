import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecs from 'aws-cdk-lib/aws-ecs';

interface PipelineRolesProps {
  readonly prefix: string;
  readonly taskDefinition: ecs.Ec2TaskDefinition;
  readonly ecsService: ecs.Ec2Service;
  readonly backendRepoPath: string;
  readonly frontendBucket: s3.Bucket;
  readonly frontendRepoPath: string;
}
export default class PipelineRoles extends Construct {
  public readonly backendPipelineRole: iam.Role;
  public readonly frontendPipelineRole: iam.Role;

  constructor(scope: Construct, id: string, props?: PipelineRolesProps) {
    super(scope, id);

    if (
      !props ||
      !props.prefix ||
      !props.backendRepoPath ||
      !props.frontendBucket ||
      !props.frontendRepoPath ||
      !props.taskDefinition ||
      !props.ecsService
    ) {
      throw new Error('props are required');
    }

    const {
      prefix,
      backendRepoPath,
      frontendRepoPath,
      frontendBucket,
      taskDefinition,
      ecsService,
    } = props;

    const githubProvider = new iam.OpenIdConnectProvider(this, 'gitHubProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const backendPipelineRole = new iam.Role(this, 'backendPipelineRole', {
      assumedBy: new iam.FederatedPrincipal(
        githubProvider.openIdConnectProviderArn,
        {
          StringLike: {
            'token.actions.githubusercontent.com:sub': `repo:${backendRepoPath}:*`,
          },
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
      roleName: `${prefix}-sam-pipeline-role`,
    });

    this.backendPipelineRole = backendPipelineRole;

    // Add policy to allow ECS task definition registration
    backendPipelineRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'RegisterTaskDefinition',
        actions: ['ecs:RegisterTaskDefinition'],
        resources: ['*'],
      }),
    );

    // Add policy to allow IAM roles to be passed to the task definition
    backendPipelineRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'PassRolesInTaskDefinition',
        actions: ['iam:PassRole'],
        resources: [taskDefinition.taskRole.roleArn, taskDefinition.executionRole?.roleArn || ''],
      }),
    );

    // Add policy to allow ECS service deployment
    backendPipelineRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'DeployService',
        actions: ['ecs:UpdateService', 'ecs:DescribeServices'],
        resources: [ecsService.serviceArn],
      }),
    );

    const frontendPipelineRole = new iam.Role(this, 'frontendPipelineRole', {
      assumedBy: new iam.FederatedPrincipal(
        githubProvider.openIdConnectProviderArn,
        {
          StringLike: {
            'token.actions.githubusercontent.com:sub': `repo:${frontendRepoPath}:*`,
          },
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
      roleName: `${prefix}-database-migration-pipeline-role`,
    });

    frontendBucket.grantPut(frontendPipelineRole);
    this.frontendPipelineRole = frontendPipelineRole;

    // output the role arn
    new cdk.CfnOutput(this, 'backendPipelineRoleArn', {
      value: backendPipelineRole.roleArn,
      description: 'Backend pipeline role ARN',
      exportName: 'backendPipelineRoleArn',
    });

    new cdk.CfnOutput(this, 'frontendPipelineRoleArn', {
      value: frontendPipelineRole.roleArn,
      description: 'Frontend pipeline role ARN',
      exportName: 'frontendPipelineRoleArn',
    });
  }
}
