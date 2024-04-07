import { Construct } from 'constructs';
import * as config from 'aws-cdk-lib/aws-config';

export interface ConfigRulesProps {
  readonly prefix: string;
}

export default class ConfigRules extends Construct {
  constructor(scope: Construct, id: string, props?: ConfigRulesProps) {
    super(scope, id);

    if (!props || !props.prefix) {
      throw new Error('props are required');
    }

    new config.ManagedRule(this, 'AccessKeysRotated', {
      identifier: config.ManagedRuleIdentifiers.ACCESS_KEYS_ROTATED,
      inputParameters: {
        maxAccessKeyAge: 60,
      },
      maximumExecutionFrequency: config.MaximumExecutionFrequency.TWELVE_HOURS,
    });

    // create config rules to check all security groups if port 22 is open
    new config.ManagedRule(this, 'SecurityGroupPort22Open', {
      identifier: config.ManagedRuleIdentifiers.EC2_SECURITY_GROUPS_INCOMING_SSH_DISABLED,
      configRuleName: `${props.prefix}-security-group-port-22-open`,
    });

    // config rule to check if dynamodb table autoscaling enabled
    new config.ManagedRule(this, 'DynamoDBBackupEnabled', {
      identifier: config.ManagedRuleIdentifiers.DYNAMODB_AUTOSCALING_ENABLED,
      configRuleName: `${props.prefix}-dynamodb-backup-enabled`,
    });

    // config rule to check if cloudtrail is enabled
    new config.ManagedRule(this, 'CloudTrailEnabled', {
      identifier: config.ManagedRuleIdentifiers.CLOUD_TRAIL_ENABLED,
      configRuleName: `${props.prefix}-cloudtrail-enabled`,
    });

    // config rule to check if cloudtrail log validation is enabled
    new config.ManagedRule(this, 'CloudTrailLogValidation', {
      identifier: config.ManagedRuleIdentifiers.CLOUD_TRAIL_LOG_FILE_VALIDATION_ENABLED,
      configRuleName: `${props.prefix}-cloudtrail-log-validation`,
    });

    // config rule to check if cloudtrail log is send to cloudwatch
    new config.ManagedRule(this, 'CloudTrailLogCloudWatch', {
      identifier: config.ManagedRuleIdentifiers.CLOUD_TRAIL_CLOUD_WATCH_LOGS_ENABLED,
      configRuleName: `${props.prefix}-cloudtrail-log-cloudwatch`,
    });

    // config rule to check if s3 bucket is not public
    new config.ManagedRule(this, 'S3BucketPublicReadProhibited', {
      identifier: config.ManagedRuleIdentifiers.S3_BUCKET_PUBLIC_READ_PROHIBITED,
      configRuleName: `${props.prefix}-s3-bucket-public-read-prohibited`,
    });

    // config rule to check cloudwatch log group encrypted
    new config.ManagedRule(this, 'CloudWatchLogGroupRetention', {
      identifier: config.ManagedRuleIdentifiers.CLOUDWATCH_LOG_GROUP_ENCRYPTED,
      configRuleName: `${props.prefix}-cloudwatch-log-group-encrypted`,
    });
  }
}
