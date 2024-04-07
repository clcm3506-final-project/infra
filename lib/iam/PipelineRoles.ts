import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';

interface PipelineRolesProps {
  readonly prefix: string;
  readonly deploymentPolicyStatements: iam.PolicyStatement[];
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
      !props.deploymentPolicyStatements
    ) {
      throw new Error('props are required');
    }

    const {
      prefix,
      backendRepoPath,
      frontendRepoPath,
      frontendBucket,
      deploymentPolicyStatements,
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

    deploymentPolicyStatements.forEach((statement) => {
      backendPipelineRole.addToPolicy(statement);
    });

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
