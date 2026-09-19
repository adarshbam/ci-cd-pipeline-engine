export interface Workflow {
  name: string;

  webhook: {
    url: string;
  };

  trigger: {
    push?: boolean;
  };

  jobs: Record<string, Job>;
}

export interface Job {
  steps: Step[];
  needs?: string[];
}

interface BaseStep {
  name: string;
}

interface CommandStep extends BaseStep {
  run: string;
}

interface ScriptStep extends BaseStep {
  script: string;
}

type Step = CommandStep | ScriptStep;
