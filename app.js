import bodyParser from 'body-parser';
import { flatten } from 'lodash';
import { app, errorHandler } from 'mu';
import { scheduleDownloadAttachment } from './lib/attachment-helpers';
import {
    getFileContent,
    writeTtlFile
} from './lib/file-helpers';
import RdfaExtractor from './lib/rdfa-extractor';
import enrichSubmission, { enrichWithAttachmentInfo } from './lib/submission-enricher';
import {
    getTasks, TASK_FAILURE_STATUS, TASK_ONGOING_STATUS,
    TASK_SUCCESS_STATUS, updateTaskStatus
} from './lib/submission-task';

import { getAuthenticationConfigForSubmission, cleanCredentials } from './lib/credential-helpers';

app.use(bodyParser.json({ type: function(req) { return /^application\/json/.test(req.get('content-type')); } }));

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
    const notStartedTasks = await getTasks(remoteFiles);

    for (let { task, submission, documentUrl, submittedDocument, remoteFile } of notStartedTasks) {
      await updateTaskStatus(task, TASK_ONGOING_STATUS);
      importSubmission(task, submission, documentUrl, submittedDocument, remoteFile); // async processing of import
    }

    return res.status(200).send({ data: notStartedTasks  });
  } catch (e) {
    console.log(`Something went wrong while handling deltas for remote data objects ${remoteFiles.join(`, `)}`);
    console.log(e);
    return next(e);
  }
});

async function importSubmission(task, submission, documentUrl, submittedDocument, remoteFile) {
  try {
    const html = await getFileContent(remoteFile);

    const rdfaExtractor = new RdfaExtractor(html, documentUrl);
    const triples = rdfaExtractor.rdfa();
    const enrichments = await enrichSubmission(submittedDocument, remoteFile, triples);
    rdfaExtractor.add(enrichments);

    const attachmentUrls = calculateAttachmentsToDownlad(triples, submittedDocument);

    if(attachmentUrls.length){
      console.log(`Found attachments: ${attachmentUrls.join('\n')}`);
      for(const attachmentUrl of attachmentUrls){
        //Note: there is no clear message when attachment download failed.
        const remoteDataObject = await scheduleDownloadAttachment(submission, attachmentUrl);
        const enrichments = await enrichWithAttachmentInfo(submittedDocument, remoteDataObject, attachmentUrl);
        rdfaExtractor.add(enrichments);
      }
    }

    const ttl = rdfaExtractor.ttl();
    const uri = await writeTtlFile(ttl, submittedDocument, remoteFile);
    console.log(`Successfully extracted data for submission <${submission}> from remote file <${remoteFile}> to <${uri}>`);
    await updateTaskStatus(task, TASK_SUCCESS_STATUS);
  }
  catch (e) {
    console.log(`Something went wrong while importing the submission from task ${task}`);
    console.log(e);
    // TODO add reason of failure message on task
    try {
      await updateTaskStatus(task, TASK_FAILURE_STATUS);
    } catch (e) {
      console.log(`Failed to update state of task ${task} to failure state. Is the connection to the database broken?`);
    }
  }
  finally {
    console.log('Removing credentials from submission if any');
    const authenticationConfig = await getAuthenticationConfigForSubmission(submission);
    if (authenticationConfig)
      await cleanCredentials(authenticationConfig.authenticationConfiguration);
  }
}

function calculateAttachmentsToDownlad(triples, submittedDocument){
  // The most basic case where bestuurseenheid doesn't have to publish linked
  // I.e. the decision has just an URI and refers to a PDF for ALL the rest.
  // Mainly meant for VGC case
  const attachmentsAsSourceOfDecisions = triples
        .filter(t => t.subject == submittedDocument
                && t.predicate == 'http://purl.org/dc/terms/source')
        .map(t => t.object);

  //This should cover simple attachments AND attachments as part of decision
  const simpleAttachments = triples
        .filter(t => t.subject == submittedDocument
                && t.predicate == 'http://data.europa.eu/eli/ontology#related_to')
        .map(t => t.object);

  //Nested decisions are ignored for now. Not sure what to expect from ABB, and how it should be rendered.

  return [ ...attachmentsAsSourceOfDecisions, ...simpleAttachments ];
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
}

app.use(errorHandler);
