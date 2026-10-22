import { Node } from '@xyflow/react';
import { JobStatus, JobIconType } from '../../types';

export interface PipelineNodeData extends Record<string, unknown> {
  id: string;
  name: string;
  duration?: string;
  status: JobStatus;
  iconType: JobIconType;
  progress?: number;
  subBadge?: string;
  startedAt?: string;
  stepCount?: number;
  completedSteps?: number;
  description?: string;
  isCenterpiece?: boolean;
}

export interface WebhookNodeData extends Record<string, unknown> {
  label: string;
  subtitle: string;
  time: string;
  commitSha: string;
}

export type PipelineFlowNode = 
  | Node<PipelineNodeData, 'pipelineJob'>
  | Node<WebhookNodeData, 'webhook'>;
