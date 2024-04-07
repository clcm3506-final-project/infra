import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface LambdaProps {
  readonly prefix: string;
  readonly name: string;
  readonly handler?: string;
  readonly srcPath?: string;
  readonly runTime?: lambda.Runtime;
  readonly vpc?: cdk.aws_ec2.IVpc;
  readonly securityGroup?: cdk.aws_ec2.SecurityGroup;
  readonly timeout?: number;
  readonly lambdaLayer?: lambda.LayerVersion;
}

export default class Lambda extends Construct {
  public readonly function: lambda.Function;
  public readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: LambdaProps) {
    super(scope, id);

    const { prefix, name, handler, srcPath, runTime } = props;

    this.role = new iam.Role(this, `${name}ExecutionRole`, {
      roleName: `${prefix}-${name}ExecutionRole`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Create a Log Group for the Lambda Function
    const lambdaLogGroup = new logs.LogGroup(this, `${name}LogGroup`, {
      logGroupName: `/aws/lambda/${prefix}-${name}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create a Lambda Function
    this.function = new lambda.Function(this, name, {
      functionName: `${prefix}-${name}`,
      runtime: runTime || lambda.Runtime.NODEJS_20_X,
      handler: handler || 'index.handler',
      role: this.role,
      code: lambda.Code.fromAsset(srcPath || `src/${name}`),
      logGroup: lambdaLogGroup,
      vpc: props.vpc || undefined,
      securityGroups: props.securityGroup ? [props.securityGroup] : undefined,
      vpcSubnets: props.vpc
        ? { subnetType: cdk.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS }
        : undefined,
      timeout: cdk.Duration.seconds(props.timeout || 10),
      layers: props.lambdaLayer ? [props.lambdaLayer] : undefined,
    });
  }
}
