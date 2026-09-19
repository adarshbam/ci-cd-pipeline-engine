export interface Workflow {
  deployment: {
    environment: string;
    runScript: string;
  };

  webhook: {
    enabled: boolean;
    url: string;
  };

  notifications: {
    notifyOnFailure: boolean;
    failureMessage: string;
  };
}
