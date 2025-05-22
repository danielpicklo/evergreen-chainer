// index.js
const { CloudRunClient } = require('@google-cloud/run');
const { Firestore } = require('@google-cloud/firestore');

const firestore = new Firestore();
const runClient = new CloudRunClient();

// Adjust to your settings
const PROJECT_ID      = 'evergreen-45696013';
const REGION          = 'us-central1';
const JOB_NAME        = 'sftp-fetch-job'; // your Job that does a single batch
const RUNS_COLLECTION = 'imports';

exports.chainNextBatch = async (snap, context) => {
  const before = snap.before.data();
  const after  = snap.after.data();
  const runId  = context.params.runId;
  const prevBatch = before.currentBatch;
  const newBatch  = after.currentBatch;
  
  // Only act when currentBatch increments by 1
  if (newBatch !== prevBatch + 1) return null;

  // Launch your Cloud Run Job for the new batch
  const parent = `projects/${PROJECT_ID}/locations/${REGION}`;
  const jobPath = `${parent}/jobs/${JOB_NAME}`;

  console.log(`Triggering ${JOB_NAME} for run ${runId}, batch ${newBatch}`);

  await runClient.runJob({
    name: jobPath,
    // pass runId and batchNum as overrides in the execution
    // Cloud Run Jobs don’t take env overrides on execution, so we encode in args
    execution: {
      template: {
        containers: [
          {
            image: `gcr.io/${PROJECT_ID}/${JOB_NAME}:latest`,
            args: [ `--runId=${runId}`, `--batchNum=${newBatch}` ]
          }
        ]
      }
    }
  });

  // Write the updated timestamp
  await firestore.collection(RUNS_COLLECTION).doc(runId).update({
    lastChainedAt: Firestore.FieldValue.serverTimestamp()
  });

  return null;
};
