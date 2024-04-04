#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfraStack } from '../lib/infra-stack';
import { Tags } from 'aws-cdk-lib';

const app = new cdk.App();

new InfraStack(app, 'InfraStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
  prefix: 'clcm3506',
  backendRepoPath: 'clcm3506-final-project/backend',
  frontendRepoPath: 'clcm3506-final-project/frontend',
});

Tags.of(app).add('project', 'clcm3506');
