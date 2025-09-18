const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.acceptQuote = functions.region("us-central1").https.onCall(async (data, context) => {
  // 1. Firebase's 'onCall' trigger automatically checks for authentication.
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to accept a quote."
    );
  }

  const { quoteId, projectId } = data;
  const landownerUid = context.auth.uid;

  if (!quoteId || !projectId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with 'quoteId' and 'projectId'."
    );
  }

  try {
    const projectRef = db.collection("projects").doc(projectId);
    const projectDoc = await projectRef.get();

    if (!projectDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Project not found.");
    }

    const projectData = projectDoc.data();

    // 2. Validate that the caller is the owner of the project
    if (projectData.ownerId !== landownerUid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You do not have permission to modify this project."
      );
    }
     
    // 3. Check if a professional is already assigned to prevent duplicates.
    if (projectData.foresterId || projectData.supplierId) {
        throw new functions.https.HttpsError(
            "failed-precondition",
            "A professional has already been assigned to this project. Please refresh the page."
        );
    }
     
    // 4. Get the quote to find the professional's ID and property ID
    const quoteDoc = await db.collection("quotes").doc(quoteId).get();

    if (!quoteDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Quote not found.");
    }
     
    const quoteData = quoteDoc.data();
    const professionalId = quoteData.professionalId;
    const propertyId = quoteData.propertyId;
    const professionalRole = quoteData.professionalRole;
    const professionalName = quoteData.professionalName;

    // 5. Prepare the updates
    let projectUpdateData = {};
    if (professionalRole === 'forester') {
        projectUpdateData = {
            status: 'cruise_in_progress',
            foresterId: professionalId,
            quoteAcceptedAt: admin.firestore.FieldValue.serverTimestamp(),
            involvedUsers: admin.firestore.FieldValue.arrayUnion(professionalId)
        };
    } else if (professionalRole === 'timber-buyer' || professionalRole === 'logging-contractor') {
        projectUpdateData = {
            status: 'harvest_in_progress',
            supplierId: professionalId,
            quoteAcceptedAt: admin.firestore.FieldValue.serverTimestamp(),
            involvedUsers: admin.firestore.FieldValue.arrayUnion(professionalId)
        };
    } else {
        throw new functions.https.HttpsError("failed-precondition", "Invalid professional role for this action.");
    }
     
    const propertyRef = db.collection("properties").doc(propertyId);
     
    // NEW: Create an activity feed entry
    const activityRef = db.collection("activity").doc();
    const activityData = {
        involvedUsers: [landownerUid, professionalId],
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        type: "QUOTE_ACCEPTED",
        message: `${projectData.ownerName} accepted the quote from ${professionalName} for the project on "${projectData.propertyName}".`,
        link: `#my-projects?projectId=${projectId}`
    };

    // 6. Run all database writes in a single atomic batch
    const batch = db.batch();
    batch.update(projectRef, projectUpdateData);
    batch.update(propertyRef, { 
      authorizedUsers: admin.firestore.FieldValue.arrayUnion(professionalId) 
    });
    batch.set(activityRef, activityData);
     
    await batch.commit();

    return { success: true, message: "Quote accepted successfully!" };

  } catch (error) {
    console.error("Error in acceptQuote function:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("internal", "An internal error occurred, check the function logs for details.");
  }
});