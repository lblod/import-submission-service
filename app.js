import { app, uuid, errorHandler } from 'mu';
import bodyParser from 'body-parser';
import flatten from 'lodash.flatten';
import { getFileContent, writeTtlFile } from './lib/file-helpers';
import RdfaExtractor from './lib/rdfa-extractor';
import { TASK_ONGOING_STATUS, TASK_SUCCESS_STATUS, TASK_FAILURE_STATUS,
         getTasks, updateTaskStatus } from './lib/submission-task';

app.use( bodyParser.json( { type: function(req) { return /^application\/json/.test( req.get('content-type') ); } } ) );

app.get('/', function(req, res) {
  res.send('Hello from import-submission-service');
});

app.post('/delta', async function(req, res, next) {
  const remoteFiles = getRemoteFileUris(req.body);
  if (!remoteFiles.length) {
    console.log("Delta does not contain a new remote data object with status 'success'. Nothing should happen.");
    return res.status(204).send();
  }

  try {
    const tasks = await getTasks(remoteFiles);

    if (!tasks.length) {
      console.log(`Remote data objects are not related to automatic submission tasks. Nothing should happen.`);
      return res.status(204).send();
    }

    for (let { task, submission, remoteFile } of tasks) {
      await updateTaskStatus(task, TASK_ONGOING_STATUS);
      importSubmission(task, submission, remoteFile); // async processing of import
    }

    return res.status(200).send({ data: tasks });
  } catch (e) {
    console.log(`Something went wrong while handling deltas for remote data objects ${remoteFiles.join(`, `)}`);
    console.log(e);
    return next(e);
  }
});

async function importSubmission(task, submission, remoteFile) {
  try {
    const html = await getFileContent(remoteFile);
    const ttl = new RdfaExtractor(html).ttl();
    // TODO enrich with derived data about document/decision types
    const uri = await writeTtlFile(ttl, remoteFile);
    console.log(`Successfully extracted data for submission <${submission}> from remote file <${remoteFile}> to <${uri}>`);
    await updateTaskStatus(task, TASK_SUCCESS_STATUS);
  } catch (e) {
    console.log(`Something went wrong while importing the submission from task ${task}`);
    console.log(e);
    // TODO add reason of failure message on task
    try {
      await updateTaskStatus(task, TASK_FAILURE_STATUS);
    } catch (e) {
      console.log(`Failed to update state of task ${task} to failure state. Is the connection to the database broken?`);
    }
  }
}

/**
 * Returns the inserted succesfully downloaded remote file URIs
 * from the delta message. An empty array if there are none.
 *
 * @param Object delta Message as received from the delta notifier
*/
function getRemoteFileUris(delta) {
  const inserts = flatten(delta.map(changeSet => changeSet.inserts));
  return inserts.filter(isTriggerTriple).map(t => t.subject.value);
}

/**
 * Returns whether the passed triple is a trigger for an import process
 *
 * @param Object triple Triple as received from the delta notifier
*/
function isTriggerTriple(triple) {
  return triple.predicate.value == 'http://www.w3.org/ns/adms#status'
    && triple.object.value == 'http://lblod.data.gift/file-download-statuses/success';
};

app.use(errorHandler);
