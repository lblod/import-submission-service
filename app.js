import bodyParser from 'body-parser';
import { app, errorHandler } from 'mu';
import { scheduleDownloadAttachment } from './lib/attachment-helpers';
import { storeStore } from './lib/file-helpers';
import { extractRdfa } from './lib/rdfa-extractor.js';
import * as ses from './lib/submission-enricher.js';
import { getSubmissionInfo } from './lib/submission-task';
import * as cts from './automatic-submission-flow-tools/constants.js';
import * as del from './automatic-submission-flow-tools/deltas.js';
import * as fil from './automatic-submission-flow-tools/asfFiles.js';
import * as tsk from './automatic-submission-flow-tools/asfTasks.js';
import { isCentraalBestuurVanEredienstDocument } from './lib/utils';
import * as err from './automatic-submission-flow-tools/errors.js';
import * as N3 from 'n3';
const { namedNode } = N3.DataFactory;

app.use(errorHandler);
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
  //We can already send a 200 back. The delta-notifier does not care about the result, as long as the request is closed.
  res.status(200).send().end();

  try {
    //Don't trust the delta-notifier, filter as best as possible. We just need the task that was created to get started.
    const actualTasks = del.getSubjects(
      req.body,
      namedNode(cts.PREDICATE_TABLE.task_operation),
      namedNode(cts.OPERATIONS.import)
    );

    for (const task of actualTasks) {
      try {
        await tsk.updateStatus(
          task,
          namedNode(cts.TASK_STATUSES.busy),
          namedNode(cts.SERVICES.import)
        );
        const remoteDataObjects = await tsk.getInputFilesFromTask(task);
        const importedFileUris = [];
        for (const remoteDataObject of remoteDataObjects) {
          const importedFileUri = await importSubmission(remoteDataObject);
          importedFileUris.push(importedFileUri);
        }
        await tsk.updateStatus(
          task,
          namedNode(cts.TASK_STATUSES.success),
          namedNode(cts.SERVICES.import),
          { files: importedFileUris.map(namedNode) }
        );
      } catch (error) {
        const message = `Something went wrong while importing for task ${task.value}`;
        console.error(`${message}\n`, error.message);
        console.error(error);
        const errorNode = await err.create(
          namedNode(cts.SERVICES.importSubmision),
          message,
          error.message
        );
        await tsk.updateStatus(
          task,
          namedNode(cts.TASK_STATUSES.failed),
          namedNode(cts.SERVICES.import),
          errorNode
        );
      }
    }
  } catch (error) {
    const message =
      'The task for importing a submission could not even be started or finished due to an unexpected problem.';
    console.error(`${message}\n`, error.message);
    console.error(error);
    await err.create(
      namedNode(cts.SERVICES.importSubmision),
      message,
      error.message
    );
  }
});

async function importSubmission(remoteDataObject) {
  const { submission, documentUrl, submittedDocument, file, graph } =
    await getSubmissionInfo(remoteDataObject);
  const htmlStream = await fil.loadStreamFromPhysicalFile(file);
  const store = await extractRdfa(htmlStream, documentUrl);
  await ses.enrichSubmission(
    submittedDocument,
    file,
    remoteDataObject,
    store,
    documentUrl
  );
  const attachmentUrls = calculateAttachmentsToDownlad(
    store,
    submittedDocument
  );
  if (attachmentUrls.length) {
    console.log(
      `Found attachments: ${attachmentUrls.map((a) => a.value).join('\n')}`
    );
    for (const attachmentUrl of attachmentUrls) {
      //Note: there is no clear message when attachment download failed.
      const remoteDataObject = await scheduleDownloadAttachment(
        submission.value,
        attachmentUrl.value
      );
      await ses.enrichWithAttachmentInfo(
        store,
        submittedDocument,
        remoteDataObject,
        attachmentUrl
      );
    }
  }
  const logicalFile = await storeStore(store, submittedDocument, graph);
  console.log(
    `Successfully extracted data for submission <${submission.value}> from remote file <${remoteDataObject.value}> to <${logicalFile.value}>`
  );
  return logicalFile.value;
}

function calculateAttachmentsToDownlad(store, submittedDocument) {
  const allAttachments = [];
  if (isCentraalBestuurVanEredienstDocument(store, submittedDocument)) {
    const relatedDocuments = store.getObjects(
      submittedDocument,
      namedNode(`${cts.PREFIX_TABLE.dct}relation`)
    );

    for (const doc of relatedDocuments) {
      const attachments = store.getObjects(
        doc,
        namedNode(`${cts.PREFIX_TABLE.dct}source`)
      );
      allAttachments.push(...attachments);
    }
  } else {
    // The most basic case where bestuurseenheid doesn't have to publish linked
    // I.e. the decision has just an URI and refers to a PDF for ALL the rest.
    // Mainly meant for VGC case
    const attachmentsAsSourceOfDecisions = store.getObjects(
      submittedDocument,
      namedNode(`${cts.PREFIX_TABLE.dct}source`)
    );

    //This should cover simple attachments AND attachments as part of decision
    const simpleAttachments = store.getObjects(
      submittedDocument,
      namedNode(`${cts.PREFIX_TABLE.eli}related_to`)
    );
    //Nested decisions are ignored for now. Not sure what to expect from ABB, and how it should be rendered.
    allAttachments.push(...attachmentsAsSourceOfDecisions);
    allAttachments.push(...simpleAttachments);
  }
  return allAttachments;
}
