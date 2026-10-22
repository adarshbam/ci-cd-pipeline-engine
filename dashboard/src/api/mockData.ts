import {
  Workflow,
  PipelineRun,
  Job,
  Environment,
  Artifact,
  IntegrationStatus,
  SecretItem,
  Metrics,
  RecentEvent,
  JobLogEntry
} from '../types';

export const mockJobsForDeployMain: Job[] = [
  {
    id: 'job-1',
    runId: 'run-deploy-main-1',
    name: 'build',
    stage: 'build',
    status: 'success',
    duration: '2m 12s',
    startedAt: '10:24 AM',
    completedAt: '10:26 AM',
    iconType: 'build',
    stepCount: 4,
    completedSteps: 4,
    description: 'Compile TypeScript, build frontend bundles, minify assets',
    logs: [
      { id: 'l1', jobId: 'job-1', timestamp: '10:24:02', level: 'info', message: 'Cloning repository at commit a74f12e...' },
      { id: 'l2', jobId: 'job-1', timestamp: '10:24:14', level: 'info', message: 'Restoring cache from node_modules.tar.gz' },
      { id: 'l3', jobId: 'job-1', timestamp: '10:24:45', level: 'info', message: 'Executing: npm run build' },
      { id: 'l4', jobId: 'job-1', timestamp: '10:26:14', level: 'success', message: '✓ Build succeeded. Output written to ./dist (4.8MB)' }
    ]
  },
  {
    id: 'job-2',
    runId: 'run-deploy-main-1',
    name: 'test',
    stage: 'test',
    status: 'success',
    duration: '4m 31s',
    startedAt: '10:26 AM',
    completedAt: '10:30 AM',
    iconType: 'test',
    dependsOn: ['job-1'],
    stepCount: 32,
    completedSteps: 32,
    description: 'Unit & integration test suites, API mock contracts',
    logs: [
      { id: 'l5', jobId: 'job-2', timestamp: '10:26:01', level: 'info', message: 'Setting up Vitest test runner across 4 workers...' },
      { id: 'l6', jobId: 'job-2', timestamp: '10:28:10', level: 'info', message: 'PASS tests/auth.spec.ts (14 tests)' },
      { id: 'l7', jobId: 'job-2', timestamp: '10:29:45', level: 'info', message: 'PASS tests/pipeline.spec.ts (18 tests)' },
      { id: 'l8', jobId: 'job-2', timestamp: '10:30:31', level: 'success', message: '✓ 32 tests passed (0 failures, 0 flaky)' }
    ]
  },
  {
    id: 'job-3',
    runId: 'run-deploy-main-1',
    name: 'lint',
    stage: 'lint',
    status: 'success',
    duration: '1m 08s',
    startedAt: '10:26 AM',
    completedAt: '10:27 AM',
    iconType: 'lint',
    dependsOn: ['job-1'],
    stepCount: 3,
    completedSteps: 3,
    description: 'ESLint, Prettier code format, TypeScript strict check',
    logs: [
      { id: 'l9', jobId: 'job-3', timestamp: '10:26:04', level: 'info', message: 'Checking code styling with ESLint 9...' },
      { id: 'l10', jobId: 'job-3', timestamp: '10:26:50', level: 'info', message: 'Checking formatting rules with Prettier...' },
      { id: 'l11', jobId: 'job-3', timestamp: '10:27:12', level: 'success', message: '✓ 0 errors, 0 warnings. Code style verified.' }
    ]
  },
  {
    id: 'job-4',
    runId: 'run-deploy-main-1',
    name: 'package',
    stage: 'package',
    status: 'running',
    duration: '3m 22s',
    startedAt: '10:30 AM',
    iconType: 'package',
    dependsOn: ['job-2', 'job-3'],
    progress: 60,
    description: 'Docker image assembly, multi-stage build & registry push',
    logs: [
      { id: 'l12', jobId: 'job-4', timestamp: '10:30:05', level: 'info', message: 'Starting Docker BuildKit daemon v0.13...' },
      { id: 'l13', jobId: 'job-4', timestamp: '10:31:15', level: 'info', message: 'Step 4/12: COPY --from=builder /app/dist ./dist' },
      { id: 'l14', jobId: 'job-4', timestamp: '10:32:00', level: 'info', message: 'Step 8/12: Compressing layer sha256:7b91e...' },
      { id: 'l15', jobId: 'job-4', timestamp: '10:32:45', level: 'info', message: 'Pushing image to registry.internal:5000/app:a74f12e (60% transferred)' }
    ]
  },
  {
    id: 'job-5',
    runId: 'run-deploy-main-1',
    name: 'deploy',
    stage: 'deploy',
    status: 'queued',
    duration: '2m 14s',
    iconType: 'deploy',
    dependsOn: ['job-4'],
    description: 'Rolling deployment to AWS ECS / CloudFront frontend cluster',
  },
  {
    id: 'job-6',
    runId: 'run-deploy-main-1',
    name: 'health check',
    stage: 'post-deploy',
    status: 'queued',
    duration: '1m 12s',
    iconType: 'health-check',
    dependsOn: ['job-5'],
    description: 'Smoke testing API endpoints, synthetic ping and latency check',
  },
  {
    id: 'job-7',
    runId: 'run-deploy-main-1',
    name: 'rollback',
    stage: 'fallback',
    status: 'skipped',
    duration: '1m 36s',
    iconType: 'rollback',
    dependsOn: ['job-6'],
    description: 'Automated revert to previous stable release if health check fails',
  }
];

export const mockMainRun: PipelineRun = {
  id: 'run-deploy-main-1',
  workflowId: 'wf-deploy-main',
  workflowName: 'deploy-main',
  runNumber: 142,
  status: 'running',
  branch: 'main',
  commitSha: 'a74f12e',
  commitMessage: 'feat(ci): optimize multi-stage build cache & add health probe',
  author: {
    name: 'Alex Rivera',
    username: 'alex',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces'
  },
  trigger: 'Triggered by push',
  totalJobs: 6,
  duration: '2m 34s',
  startedAt: 'Today at 10:24 AM',
  elapsedTime: '2m 34s elapsed',
  environment: 'Production',
  jobs: mockJobsForDeployMain
};

export const mockWorkflows: Workflow[] = [
  {
    id: 'wf-deploy-main',
    name: 'deploy-main',
    slug: 'deploy-main',
    description: 'Production deployment pipeline for web application',
    repository: 'acme/vault-cloud-storage',
    defaultBranch: 'main',
    lastRunStatus: 'running',
    lastRunTime: 'Just now',
    triggers: ['push', 'webhook', 'manual'],
    activeRunsCount: 1,
    successRate: 96.5,
    avgDuration: '10m 24s',
    totalRuns: 142,
    yamlConfig: `name: deploy-main
on:
  push:
    branches: [ main ]
  webhook:
    events: [ push, release ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install & Build
        run: |
          npm ci
          npm run build

  test:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - run: npm test

  lint:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - run: npm run lint

  package:
    needs: [test, lint]
    runs-on: self-hosted
    steps:
      - name: Build Docker Image
        run: docker build -t vault-app:latest .

  deploy:
    needs: package
    environment: production
    steps:
      - name: Deploy to Cloud
        run: ./scripts/deploy-full.sh

  health-check:
    needs: deploy
    steps:
      - run: curl -f https://api.vault.internal/health`
  },
  {
    id: 'wf-ci-pull-requests',
    name: 'ci-pr-validation',
    slug: 'ci-pr-validation',
    description: 'Pull request quality gate, unit tests, bundle analysis & security scans',
    repository: 'acme/vault-cloud-storage',
    defaultBranch: 'main',
    lastRunStatus: 'success',
    lastRunTime: '2 hours ago',
    triggers: ['pull_request'],
    activeRunsCount: 0,
    successRate: 98.2,
    avgDuration: '4m 12s',
    totalRuns: 384
  },
  {
    id: 'wf-nightly-security',
    name: 'nightly-sec-audit',
    slug: 'nightly-sec-audit',
    description: 'Daily container CVE vulnerability scanning, dependency SBOM audit',
    repository: 'acme/vault-cloud-storage',
    defaultBranch: 'main',
    lastRunStatus: 'success',
    lastRunTime: 'Yesterday at 3:00 AM',
    triggers: ['schedule'],
    activeRunsCount: 0,
    successRate: 94.0,
    avgDuration: '15m 45s',
    totalRuns: 89
  },
  {
    id: 'wf-db-migration',
    name: 'database-migration',
    slug: 'database-migration',
    description: 'Zero-downtime database schema migration & backup snapshotting',
    repository: 'acme/vault-cloud-storage',
    defaultBranch: 'main',
    lastRunStatus: 'success',
    lastRunTime: '3 days ago',
    triggers: ['manual'],
    activeRunsCount: 0,
    successRate: 100,
    avgDuration: '6m 18s',
    totalRuns: 28
  }
];

export const mockRunsList: PipelineRun[] = [
  mockMainRun,
  {
    id: 'run-141',
    workflowId: 'wf-deploy-main',
    workflowName: 'deploy-main',
    runNumber: 141,
    status: 'success',
    branch: 'main',
    commitSha: 'f820bc3',
    commitMessage: 'fix(api): fix connection pool timeout on redis read replica',
    author: { name: 'Sarah Chen', username: 'schen' },
    trigger: 'Triggered by push',
    totalJobs: 6,
    duration: '9m 48s',
    startedAt: 'Yesterday at 4:15 PM',
    elapsedTime: 'Completed in 9m 48s',
    environment: 'Production',
    jobs: []
  },
  {
    id: 'run-140',
    workflowId: 'wf-ci-pull-requests',
    workflowName: 'ci-pr-validation',
    runNumber: 140,
    status: 'success',
    branch: 'feat/oauth-google',
    commitSha: '31cb5d9',
    commitMessage: 'feat(auth): add OAuth2 refresh token auto rotation',
    author: { name: 'Marcus Brody', username: 'mbrody' },
    trigger: 'Pull request #42',
    totalJobs: 4,
    duration: '4m 02s',
    startedAt: 'Yesterday at 11:20 AM',
    elapsedTime: 'Completed in 4m 02s',
    environment: 'Preview',
    jobs: []
  },
  {
    id: 'run-139',
    workflowId: 'wf-deploy-main',
    workflowName: 'deploy-main',
    runNumber: 139,
    status: 'failed',
    branch: 'main',
    commitSha: '9e1104a',
    commitMessage: 'chore(deps): update prisma ORM to v5.12',
    author: { name: 'Alex Rivera', username: 'alex' },
    trigger: 'Triggered by push',
    totalJobs: 6,
    duration: '5m 12s',
    startedAt: '2 days ago',
    elapsedTime: 'Failed at step 3 (test)',
    environment: 'Production',
    jobs: []
  },
  {
    id: 'run-138',
    workflowId: 'wf-nightly-security',
    workflowName: 'nightly-sec-audit',
    runNumber: 138,
    status: 'success',
    branch: 'main',
    commitSha: '9e1104a',
    commitMessage: 'Scheduled automated security audit',
    author: { name: 'System Bot', username: 'bot' },
    trigger: 'Scheduled (Cron)',
    totalJobs: 3,
    duration: '14m 10s',
    startedAt: '3 days ago',
    elapsedTime: 'Completed in 14m 10s',
    environment: 'Staging',
    jobs: []
  }
];

export const mockMetrics: Metrics = {
  activeRuns: 1,
  successRate: 96.5,
  avgDuration: '10m 24s',
  durationChangePercentage: -12, // ↓ 12% vs previous 50
  totalRuns30Days: 142,
  failureCount: 4,
  queuedRuns: 2
};

export const mockEnvironments: Environment[] = [
  {
    id: 'env-prod',
    name: 'Production',
    status: 'deploying',
    url: 'https://vault.internal.net',
    currentRunId: 'run-deploy-main-1',
    lastDeployedAt: '3 hours ago',
    activeVersion: 'v2.14.0',
    healthScore: 99.8,
    targetBranch: 'main'
  },
  {
    id: 'env-staging',
    name: 'Staging',
    status: 'idle',
    url: 'https://staging.vault.internal.net',
    lastDeployedAt: 'Yesterday at 5:00 PM',
    activeVersion: 'v2.15.0-rc1',
    healthScore: 100,
    targetBranch: 'staging'
  },
  {
    id: 'env-preview',
    name: 'Preview',
    status: 'idle',
    url: 'https://pr-42.preview.vault.internal.net',
    lastDeployedAt: 'Yesterday at 11:25 AM',
    activeVersion: 'pr-42-b91c',
    healthScore: 100,
    targetBranch: 'feat/oauth-google'
  }
];

export const mockRecentEvents: RecentEvent[] = [
  {
    id: 'evt-1',
    timestamp: '10:32 AM',
    title: 'Package job started',
    description: 'Building production artifacts and docker images...',
    type: 'package',
    status: 'running'
  },
  {
    id: 'evt-2',
    timestamp: '10:31 AM',
    title: 'Lint job completed',
    description: '1m 08s • All checks passed',
    type: 'lint',
    status: 'success'
  },
  {
    id: 'evt-3',
    timestamp: '10:26 AM',
    title: 'Test job completed',
    description: '4m 31s • 32 tests passed',
    type: 'test',
    status: 'success'
  },
  {
    id: 'evt-4',
    timestamp: '10:24 AM',
    title: 'Build job completed',
    description: '2m 12s • Artifact created',
    type: 'build',
    status: 'success'
  },
  {
    id: 'evt-5',
    timestamp: '10:24 AM',
    title: 'Workflow run started',
    description: 'Triggered by push to main',
    type: 'system',
    status: 'info'
  },
  {
    id: 'evt-6',
    timestamp: '10:24 AM',
    title: 'Webhook received',
    description: 'a74f12e • pushed by alex',
    type: 'webhook',
    status: 'info',
    metadata: 'ref: refs/heads/main'
  }
];

export const mockArtifacts: Artifact[] = [
  {
    id: 'art-1',
    name: 'production-bundle.tar.gz',
    size: '14.2 MB',
    type: 'tar',
    jobName: 'package',
    createdAt: 'Today at 10:32 AM',
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    expiresIn: '30 days'
  },
  {
    id: 'art-2',
    name: 'docker-image-vault-web.tar',
    size: '89.4 MB',
    type: 'docker',
    jobName: 'package',
    createdAt: 'Today at 10:30 AM',
    sha256: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
    expiresIn: '90 days'
  },
  {
    id: 'art-3',
    name: 'vitest-coverage-report.zip',
    size: '3.1 MB',
    type: 'report',
    jobName: 'test',
    createdAt: 'Today at 10:29 AM',
    sha256: 'c891b017f85e49f6920f04c0ec06c4b2ff2886f3458bfb965f7c35f2c25381a1',
    expiresIn: '14 days'
  },
  {
    id: 'art-4',
    name: 'build-manifest.json',
    size: '24 KB',
    type: 'binary',
    jobName: 'build',
    createdAt: 'Today at 10:26 AM',
    sha256: '185f8db32271fe25f561a6fc938b2e264306ec304eda518007d1764826381969',
    expiresIn: '60 days'
  }
];

export const mockSecrets: SecretItem[] = [
  {
    id: 'sec-1',
    name: 'GITHUB_WEBHOOK_SECRET',
    environment: 'All environments',
    lastUpdated: '12 days ago',
    updatedBy: 'alex',
    preview: 'whsec_89fa****************'
  },
  {
    id: 'sec-2',
    name: 'AWS_ACCESS_KEY_ID',
    environment: 'Production',
    lastUpdated: '1 month ago',
    updatedBy: 'alex',
    preview: 'AKIA****************'
  },
  {
    id: 'sec-3',
    name: 'AWS_SECRET_ACCESS_KEY',
    environment: 'Production',
    lastUpdated: '1 month ago',
    updatedBy: 'alex',
    preview: 'wJalrXUtnFEMI/K7****************'
  },
  {
    id: 'sec-4',
    name: 'DOCKER_REGISTRY_TOKEN',
    environment: 'Production, Staging',
    lastUpdated: '3 weeks ago',
    updatedBy: 'mbrody',
    preview: 'dckr_pat_****************'
  },
  {
    id: 'sec-5',
    name: 'SLACK_WEBHOOK_URL',
    environment: 'All environments',
    lastUpdated: '2 months ago',
    updatedBy: 'schen',
    preview: 'https://hooks.slack.com/services/T00/***'
  }
];

export const mockIntegrations: IntegrationStatus[] = [
  {
    id: 'int-github',
    name: 'GitHub Webhook Engine',
    provider: 'github',
    status: 'connected',
    webhookUrl: 'https://api.vault.internal/webhooks/github',
    lastSync: '1 minute ago',
    eventsHandledCount: 1248,
    description: 'Listens for push, pull_request, and release events to trigger automated pipeline execution',
    secretKeyPrefix: 'whsec_••••'
  },
  {
    id: 'int-slack',
    name: 'Slack CI/CD Channel',
    provider: 'slack',
    status: 'connected',
    lastSync: '10 minutes ago',
    eventsHandledCount: 420,
    description: 'Sends real-time build alerts, deployment status summaries, and approval requests to #deploy-alerts'
  },
  {
    id: 'int-docker',
    name: 'Docker Hub / Internal Registry',
    provider: 'docker',
    status: 'connected',
    lastSync: '24 minutes ago',
    eventsHandledCount: 89,
    description: 'Pushes verified multi-arch container images to production and staging registry namespaces'
  },
  {
    id: 'int-aws',
    name: 'AWS ECS / CloudFront / S3',
    provider: 'aws',
    status: 'connected',
    lastSync: 'Just now',
    eventsHandledCount: 310,
    description: 'Direct infrastructure deployment target with automated zero-downtime rolling task updates'
  },
  {
    id: 'int-backblaze',
    name: 'Backblaze B2 Object Storage',
    provider: 'backblaze',
    status: 'connected',
    lastSync: '2 hours ago',
    eventsHandledCount: 52,
    description: 'Long-term immutable archive for build artifacts, test recordings, and diagnostic logs'
  }
];
