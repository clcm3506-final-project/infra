import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export interface DynamodbProps {
  readonly rcu?: number;
  readonly wcu?: number;
}

export default class Dynamodb extends Construct {
  public readonly patientsTable: dynamodb.TableV2;
  public readonly recordsTable: dynamodb.TableV2;

  constructor(scope: Construct, id: string, props?: DynamodbProps) {
    super(scope, id);

    const { rcu, wcu } = props || {};

    const readCapacity = dynamodb.Capacity.fixed(rcu || 2);
    const writeCapacity = dynamodb.Capacity.autoscaled({ maxCapacity: wcu || 2 });

    // Create a dynamodb table
    this.patientsTable = new dynamodb.TableV2(this, 'patientsTable', {
      tableName: 'Patients',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.NUMBER },
      billing: dynamodb.Billing.provisioned({
        readCapacity,
        writeCapacity,
      }),
    });

    // Create a dynamodb table
    this.recordsTable = new dynamodb.TableV2(this, 'recordsTable', {
      tableName: 'Records',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.NUMBER },
      billing: dynamodb.Billing.provisioned({ readCapacity, writeCapacity }),
    });

    // output the table arn
    new cdk.CfnOutput(this, 'patientsTableArn', {
      value: this.patientsTable.tableArn,
      description: 'Paticents table ARN',
      exportName: 'patientsTableArn',
    });

    new cdk.CfnOutput(this, 'recordsTableArn', {
      value: this.recordsTable.tableArn,
      description: 'Records table ARN',
      exportName: 'recordsTableArn',
    });
  }
}
