import bodyParser from 'body-parser';
import { app, errorHandler } from 'mu';
import { scheduleDownloadAttachment } from './lib/attachment-helpers';
import { loadFileData, writeTtlFile } from './lib/file-helpers';
import RdfaExtractor from './lib/rdfa-extractor';
import {
  enrichSubmission,
  enrichWithAttachmentInfo,
} from './lib/submission-enricher';
import {
  getRemoteDataObjectUris,
  getSubmissionInfo,
} from './lib/submission-task';
import * as env from './constants.js';
import { saveError, isCentraalBestuurVanEredienstDocument } from './lib/utils';
import { updateTaskStatus } from './lib/submission-task.js';

app.use(
  bodyParser.json({
    type: function (req) {
      return /^application\/json/.test(req.get('content-type'));
    },
  })
);

app.get('/', function (req, res) {
  res.send('Hello from import-submission-service');
});

app.post('/delta', async function (req, res) {
  //We can already send a 200 back. The delta-notifier does not care about the
  //result, as long as the request is closed.
  res.status(200).send().end();

  try {
    //Don't trust the delta-notifier, filter as best as possible. We just need
    //the task that was created to get started.
    const actualTaskUris = req.body
      .map((changeset) => changeset.inserts)
      .filter((inserts) => inserts.length > 0)
      .flat()
      .filter((insert) => insert.predicate.value === env.OPERATION_PREDICATE)
      .filter((insert) => insert.object.value === env.IMPORT_OPERATION)
      .map((insert) => insert.subject.value);

    for (const taskUri of actualTaskUris) {
      try {
        await updateTaskStatus(taskUri, env.TASK_ONGOING_STATUS);
        const remoteDataObjects = await getRemoteDataObjectUris(taskUri);
        const importedFileUris = [];
        for (const remoteDataObject of remoteDataObjects) {
          const { logicalUri } = await importSubmission(remoteDataObject);
          //Give logical file uri and not physical, because this is for the
          //tasks and the dashboard
          importedFileUris.push(logicalUri);
        }
        await updateTaskStatus(
          taskUri,
          env.TASK_SUCCESS_STATUS,
          undefined,
          importedFileUris
        );
      } catch (error) {
        const message = `Something went wrong while importing for task ${taskUri}`;
        console.error(`${message}\n`, error.message);
        console.error(error);
        const errorUri = await saveError({ message, detail: error.message });
        await updateTaskStatus(taskUri, env.TASK_FAILURE_STATUS, errorUri);
      }
    }
  } catch (error) {
    const message =
      'The task for importing a submission could not even be started or finished due to an unexpected problem.';
    console.error(`${message}\n`, error.message);
    console.error(error);
    await saveError({ message, detail: error.message });
  }
});

async function importSubmission(remoteDataObject) {
  const { submission, documentUrl, submittedDocument, fileUri } =
    await getSubmissionInfo(remoteDataObject);
  const html = await loadFileData(fileUri);
  const rdfaExtractor = new RdfaExtractor(html, documentUrl);
  const triples = rdfaExtractor.rdfa();
  const enrichments = await enrichSubmission(
    submittedDocument,
    fileUri,
    remoteDataObject,
    triples,
    documentUrl
  );
  rdfaExtractor.add(enrichments);

  const attachmentUrls = calculateAttachmentsToDownlad(
    triples,
    submittedDocument
  );

  if (attachmentUrls.length) {
    console.log(`Found attachments: ${attachmentUrls.join('\n')}`);
    for (const attachmentUrl of attachmentUrls) {
      //Note: there is no clear message when attachment download failed.
      const remoteDataObject = await scheduleDownloadAttachment(
        submission,
        attachmentUrl
      );
      const enrichments = await enrichWithAttachmentInfo(
        submittedDocument,
        remoteDataObject,
        attachmentUrl
      );
      rdfaExtractor.add(enrichments);
    }
  }

  const ttl = rdfaExtractor.ttl();
  const { logicalUri, physicalUri } = await writeTtlFile(
    ttl,
    submittedDocument,
    remoteDataObject
  );
  console.log(
    `Successfully extracted data for submission <${submission}> from remote file <${remoteDataObject}> to <${logicalUri}>`
  );
  return { logicalUri, physicalUri };
}

function calculateAttachmentsToDownlad(triples, submittedDocument) {
  let allAttachments = [];

  if (isCentraalBestuurVanEredienstDocument(submittedDocument, triples)) {
    const relatedDocuments = triples
      .filter(
        (t) =>
          t.subject == submittedDocument &&
          t.predicate == 'http://purl.org/dc/terms/relation'
      )
      .map((t) => t.object);

    for (const docUri of relatedDocuments) {
      const attachments = triples
        .filter(
          (t) =>
            t.subject == docUri &&
            t.predicate == 'http://purl.org/dc/terms/source'
        )
        .map((t) => t.object);

      allAttachments = [...allAttachments, ...attachments];
    }
  } else {
    // The most basic case where bestuurseenheid doesn't have to publish linked
    // I.e. the decision has just an URI and refers to a PDF for ALL the rest.
    // Mainly meant for VGC case
    const attachmentsAsSourceOfDecisions = triples
      .filter(
        (t) =>
          t.subject == submittedDocument &&
          t.predicate == 'http://purl.org/dc/terms/source'
      )
      .map((t) => t.object);

    //This should cover simple attachments AND attachments as part of decision
    const simpleAttachments = triples
      .filter(
        (t) =>
          t.subject == submittedDocument &&
          t.predicate == 'http://data.europa.eu/eli/ontology#related_to'
      )
      .map((t) => t.object);

    //Nested decisions are ignored for now. Not sure what to expect from ABB,
    //and how it should be rendered.

    allAttachments = [...attachmentsAsSourceOfDecisions, ...simpleAttachments];
  }
  return allAttachments;
}

app.use(errorHandler);
