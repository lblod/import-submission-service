import * as smt from '../automatic-submission-flow-tools/asfSubmissions';

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
  let results = await smt.getSubmissionInfoFromRemoteDataObject(
    remoteDataObject
  );
  if (results.length > 0) results = results[0];
  else
    throw new Error(
      `Could not find the information about the submission for file ${remoteDataObject}`
    );
  return {
    submission: results.submission,
    documentUrl: results.documentUrl,
    submittedDocument: results.submittedDocument,
    file: results.file,
    graph: results.graph,
  };
}
