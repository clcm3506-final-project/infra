import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import Dynamodb from './storage/Dynamodb';
import Ecs from './compute/ECS';

interface InfraStackProps extends cdk.StackProps{ 
  readonly prefix: string;
}

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: InfraStackProps) {
    super(scope, id, props);

    if (!props || !props.prefix){
      throw new Error('props are required');
    }

    const { prefix } = props;

    const tables = new Dynamodb(this, 'Dynamodb', { rcu: 2, wcu: 2 });

    const cluster = new Ecs(this, 'backend', {
      prefix,
    });

    tables.patientsTable.grantReadWriteData(cluster.taskDefinition.taskRole);
    tables.recordsTable.grantReadWriteData(cluster.taskDefinition.taskRole);

    // create ECR repository
    const repository = new cdk.aws_ecr.Repository(this, 'backendRepository', {
      repositoryName: `${prefix}-backend`,
    });

    // output the repository uri
    new cdk.CfnOutput(this, 'repositoryUri', {
      value: repository.repositoryUri,
      description: 'Repository URI',
      exportName: 'repositoryUri',
    });

  }
}
