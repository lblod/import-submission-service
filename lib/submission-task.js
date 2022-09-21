import * as cts from '../automatic-submission-flow-tools/constants.js';
import * as tsk from '../automatic-submission-flow-tools/asfTasks.js';
import * as smt from '../automatic-submission-flow-tools/asfSubmissions.js';
import * as N3 from 'n3';
const { namedNode } = N3.DataFactory;

export async function updateTaskStatus(
  taskUri,
  statusUri,
  errorUri,
  importedFileUris
) {
  return tsk.updateStatus(
    namedNode(taskUri),
    namedNode(statusUri),
    namedNode(cts.SERVICES.import),
    { files: importedFileUris?.map(namedNode) }
  );
}

/**
 * Search for the files associated with the download task from before. The file linked to that task is a remote data object that has a physical file linked to it that has been downloaded by the download service.
 *
 * @public
 * @async
 * @function
 * @param {object} taskUri - The IRI of the task you want the associated files of.
 * @returns {array(string)} Array of file URI strings.
 */
export async function getRemoteDataObjectUris(taskUri) {
  const results = await tsk.getInputFilesFromTask(namedNode(taskUri));
  return results.map((res) => res.file.value);
}

/**
 * Search for some information about a submission through its associated remote data object.
 *
 * @public
 * @async
 * @function
 * @param {string} remoteDataObject - IRI of the remote data object linked to the submission.
 * @returns {object} An object with the keys `submission`, `documentUrl`, `submittedDocument`,`fileUri`.
 */
export async function getSubmissionInfo(remoteDataObject) {
  let results = await smt.getSubmissionInfo(namedNode(remoteDataObject));
  if (results.length > 0) results = results[0];
  else
    throw new Error(
      `Could not find the information about the submission for file ${remoteDataObject}`
    );
  return {
    submission: results.submission.value,
    documentUrl: results.documentUrl.value,
    submittedDocument: results.submittedDocument.value,
    fileUri: results.file.value,
    graph: results.graph.value,
  };
}
