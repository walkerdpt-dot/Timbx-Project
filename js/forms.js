// js/forms.js
import { doc, addDoc, collection, serverTimestamp, getDocs, query, where, deleteDoc, updateDoc, arrayUnion, writeBatch, deleteField } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";
import { db, currentUser, allProperties, allInquiries, allProjects, allProfessionalProfiles, setCurrentUser, app } from './state.js';
import { onUserStatusChange } from './main.js';
import { closeModal, openModal, renderInquiriesForCurrentUser, renderMyProfile, showConfirmationModal, renderMyLoads, showToast } from './ui.js';
import { saveNewProperty, updateProperty, createNewInquiryProject, updateInquiryStatus, updateProject, saveTimberSale, saveHaulTicket, updateUserProfile, saveProjectRates, callAcceptQuote, saveProjectMessage, updateHaulTicket, createActivityEntry } from './firestore.js';
import { getLastDrawnGeoJSON, getProjectAnnotationsAsGeoJSON, getUpdatedLocation } from './map.js';

// --- Form Handlers ---

export async function handleSaveProperty(event) {
    event.preventDefault();
    if (!currentUser) {
        showToast("You must be logged in to save a property.", "error");
        return;
    }

    const propertyName = document.getElementById('property-name').value.trim();
    const boundary = getLastDrawnGeoJSON();
    if (!propertyName || !boundary) {
        showToast("Please provide a Property Name and draw a boundary on the map.", "error");
        return;
    }

    const submitButton = event.target.querySelector('#btn-save-property');
    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';

    const propertyId = document.getElementById('property-id').value;
      
    const propertyData = {
        name: document.getElementById('property-name').value,
        county: document.getElementById('property-county').value,
        state: document.getElementById('property-state').value,
        apn: document.getElementById('property-apn').value,
        str: document.getElementById('property-str').value,
        topography: document.getElementById('property-topography').value,
        accessibility: document.getElementById('property-accessibility').value,
        timberType: document.getElementById('property-timber-type').value,
        species: document.getElementById('property-species').value,
        age: document.getElementById('property-age').value,
        basalArea: document.getElementById('property-basal-area').value,
        siteIndex: document.getElementById('property-site-index').value,
        previousCutYear: document.getElementById('property-previous-cut-year').value,
        previousCutType: document.getElementById('property-previous-cut-type').value,
        description: document.getElementById('property-desc').value,
        acreage: parseFloat(document.getElementById('calculated-acreage').textContent) || 0
    };
      
    try {
        if (propertyId) {
            await updateProperty(db, propertyId, boundary, propertyData);
        } else {
            await saveNewProperty(db, currentUser, boundary, propertyData);
        }
          
        await onUserStatusChange(currentUser); // Refresh data
        window.location.hash = '#properties'; // Navigate back to properties list

    } catch (error) {
        console.error("Error saving property:", error);
        showToast("Could not save property. Please try again.", "error");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Save Property';
    }
}

export async function handleTimberSaleSubmit(event) {
    event.preventDefault();
    if (!currentUser) return showToast("You must be logged in.", "error");

    const projectId = document.getElementById('timber-sale-property-id').value;
    const submitButton = event.target.querySelector('#btn-submit-sale-form');
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';

    try {
        const inventory = [];
        document.querySelectorAll('.inventory-stand').forEach(standEl => {
            const standNameSelect = standEl.querySelector('.inventory-stand-name');
            const standName = standNameSelect.value;
            if (!standName) return;

            let standAcres = 0;
            if (document.getElementById('cruise-entire-tract-checkbox').checked) {
                const project = allProjects.find(p => p.id === projectId);
                const property = allProperties.find(p => p.id === project.propertyId);
                standAcres = property ? property.acreage : 0;
            } else {
                const selectedOption = standNameSelect.selectedOptions[0];
                if (selectedOption && selectedOption.dataset.acreage) {
                    standAcres = parseFloat(selectedOption.dataset.acreage);
                }
            }

            const standData = {
                name: standName,
                netAcres: standAcres,
                products: [],
                totals: {
                    totalVolume: parseFloat(standEl.querySelector('.stand-total-volume').textContent) || 0,
                    treesPerAcre: parseFloat(standEl.querySelector('.stand-trees-per-acre').textContent) || 0,
                    volumePerAcre: parseFloat(standEl.querySelector('.stand-volume-per-acre').textContent) || 0,
                }
            };
             
            standEl.querySelectorAll('.inventory-product-group').forEach(productEl => {
                const productName = productEl.querySelector('.inventory-product').value;
                if (!productName) return;

                const productData = { product: productName, breakdown: [] };

                productEl.querySelectorAll('.dbh-row').forEach(dbhRow => {
                    const dbh = dbhRow.querySelector('.dbh-class').value;
                    const trees = parseInt(dbhRow.querySelector('.dbh-trees').value, 10);
                    const volume = parseFloat(dbhRow.querySelector('.dbh-volume').value);
                    const units = dbhRow.querySelector('.dbh-unit').value;

                    if ((!isNaN(trees) && trees > 0) || (!isNaN(volume) && volume > 0)) {
                        productData.breakdown.push({
                            dbh,
                            trees: trees || 0,
                            volume: volume || 0,
                            units
                        });
                    }
                });

                if (productData.breakdown.length > 0) {
                    standData.products.push(productData);
                }
            });

            if (standData.products.length > 0) {
                inventory.push(standData);
            }
        });

        const saleFormData = {
            saleName: document.getElementById('sale-name').value,
            county: document.getElementById('sale-county').value,
            state: document.getElementById('sale-state').value,
            acreage: parseFloat(document.getElementById('sale-acreage').value) || 0,
            legalDesc: document.getElementById('sale-legal-desc').value,
            accessDescription: document.getElementById('sale-access-desc').value,
            loggingConditions: document.getElementById('sale-logging-conditions').value,
            bidMethod: document.getElementById('sale-type').value,
            bidDeadline: document.getElementById('bid-deadline').value,
            harvestDescription: document.getElementById('sale-harvest-desc').value,
            boundaryDescription: document.getElementById('sale-boundary-desc').value,
            smzRules: document.getElementById('sale-smz-rules').value,
            stumpHeight: document.getElementById('sale-stump-height').value,
            contractLength: document.getElementById('sale-contract-length').value,
            performanceBondAmount: document.getElementById('sale-performance-bond-amount').value,
            insuranceGli: document.getElementById('sale-insurance-gli').value,
            insuranceWc: document.getElementById('sale-insurance-wc').value,
            guaranteeTally: document.getElementById('sale-guarantee-tally').checked,
            moreConditions: document.getElementById('sale-more-conditions').value
        };

        const payload = {
            status: 'pending_approval',
            cruiseData: {
                details: saleFormData,
                inventory: inventory,
                annotations: JSON.stringify(getProjectAnnotationsAsGeoJSON())
            }
        };

        await updateProject(db, projectId, payload);

        const project = allProjects.find(p => p.id === projectId);
        if (project) {
            await createActivityEntry(db, {
                involvedUsers: project.involvedUsers,
                type: "CRUISE_SUBMITTED",
                message: `${currentUser.username} submitted cruise data for the project on "${project.propertyName}".`,
                link: `#add-edit-cruise?projectId=${projectId}`
            });
        }
        
        showToast("Cruise data submitted! The landowner has been notified for review.", "success");
        await onUserStatusChange(currentUser);
        window.location.hash = '#my-projects';

    } catch (error) {
        console.error("Error submitting cruise data:", error);
        showToast("There was an error submitting the cruise data.", "error");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit Cruise for Review';
    }
}

export async function handleRetractCruise(projectId) {
    const confirmed = await showConfirmationModal(
        "Retract Cruise?",
        "Are you sure you want to retract your cruise submission? This will allow you to make edits and resubmit."
    );
    if (!confirmed) return;

    try {
        await updateProject(db, projectId, { 
            status: 'cruise_in_progress',
        });
        showToast("Cruise retracted successfully. You can now make edits.", "success");
        await onUserStatusChange(currentUser);
        window.location.hash = `#add-edit-cruise?projectId=${projectId}`; 
    } catch (error) {
        console.error("Error retracting cruise:", error);
        showToast("There was an error retracting the cruise. Please try again.", "error");
    }
}

export async function handleStartTimberSale(projectId) {
    const confirmed = await showConfirmationModal(
        "Post Timber Sale?",
        "This will post the timber sale to the public marketplace. Are you sure you want to proceed?"
    );
    if (confirmed) {
        try {
            const project = allProjects.find(p => p.id === projectId);
            if (!project || !project.cruiseData) throw new Error("Cruise data is missing.");

            const salePayload = {
                ownerId: project.ownerId,
                ownerName: project.ownerName,
                projectId: project.id,
                foresterId: project.foresterId || null,
                propertyName: project.propertyName,
                geoJSON: project.geoJSON,
                ...project.cruiseData.details,
                cruiseData: project.cruiseData
            };

            await saveTimberSale(db, salePayload);
            await updateProject(db, projectId, { status: 'open_for_bids' });

            await createActivityEntry(db, {
                involvedUsers: project.involvedUsers,
                type: "SALE_POSTED",
                message: `The timber sale for "${project.propertyName}" is now live on the marketplace.`,
                link: `#my-projects?projectId=${projectId}`
            });
              
            showToast("Timber sale is now live on the marketplace!", "success");
            await onUserStatusChange(currentUser);
            window.location.hash = '#my-projects';
        } catch (error) {
             console.error("Error starting timber sale:", error);
             showToast("There was an error starting the timber sale.", "error");
        }
      }
}

export async function handleCompleteProject(projectId) {
    const confirmed = await showConfirmationModal(
        "Complete Project?",
        "Are you sure you want to accept this cruise and complete the project? This will finalize the service with the forester."
    );
    if (confirmed) {
        try {
            await updateProject(db, projectId, { status: 'completed' });
            
            const project = allProjects.find(p => p.id === projectId);
            if (project) {
                await createActivityEntry(db, {
                    involvedUsers: project.involvedUsers,
                    type: "PROJECT_COMPLETED",
                    message: `The project on "${project.propertyName}" has been marked as complete.`,
                    link: `#my-projects?projectId=${projectId}`
                });
            }

            showToast("Cruise accepted and project marked as complete!", "success");
            await onUserStatusChange(currentUser);
            window.location.hash = '#my-projects';
        } catch (error) {
            console.error("Error completing project:", error);
            showToast("There was an error completing the project.", "error");
        }
    }
}

export async function handleSubmitBidOrQuote(event) {
    event.preventDefault();
    if (!currentUser) return showToast("You must be logged in to submit.", "error");

    const submitButton = event.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';

    const inquiryId = document.getElementById('quote-inquiry-id').value;
    const contextId = document.getElementById('quote-context-id').value;
    const landownerId = document.getElementById('quote-landowner-id').value;
    const amount = parseFloat(document.getElementById('quote-amount').value);
    const message = document.getElementById('quote-message').value;

    try {
        if (inquiryId) {
            const inquiry = allInquiries.find(i => i.id === inquiryId);
            if (!inquiry) throw new Error("Could not find original inquiry.");
              
            const quoteData = {
                inquiryId: inquiryId,
                projectId: inquiry.projectId,
                propertyId: contextId,
                landownerId: landownerId,
                professionalId: currentUser.uid,
                professionalName: currentUser.username,
                professionalRole: currentUser.role,
                amount: amount,
                message: message,
                status: 'pending',
                createdAt: serverTimestamp()
            };
            await addDoc(collection(db, "quotes"), quoteData);
              
            await updateInquiryStatus(db, inquiryId, 'quoted');

            await createActivityEntry(db, {
                involvedUsers: [landownerId, currentUser.uid],
                type: "QUOTE_SUBMITTED",
                message: `${currentUser.username} submitted a quote for your project on "${inquiry.propertyName}".`,
                link: `#my-projects?projectId=${inquiry.projectId}`
            });

            await onUserStatusChange(currentUser);
            renderInquiriesForCurrentUser();
            showToast('Your quote has been sent to the Landowner!', "success");

        } else {
            const bidData = {
                projectId: contextId,
                landownerId: landownerId,
                bidderId: currentUser.uid,
                bidderName: currentUser.username,
                bidderRole: currentUser.role,
                amount: amount,
                message: message,
                status: 'pending',
                createdAt: serverTimestamp()
            };
            await addDoc(collection(db, "bids"), bidData);
            showToast('Your bid has been successfully submitted!', "success");
        }
          
        closeModal('submit-quote-modal');

    } catch (error) {
        console.error("Error submitting quote/bid: ", error);
        showToast(`There was an error submitting. ${error.message}`, "error");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit';
    }
}

export async function handleSendInquiries(event) {
    const button = event.target;
    button.disabled = true;
    button.textContent = 'Sending...';

    const modal = document.getElementById('invite-forester-modal');
    const propertyId = modal.dataset.propertyId;
    const property = allProperties.find(p => p.id === propertyId);
      
    const selectedProfessionalIds = Array.from(document.querySelectorAll('#forester-invite-list input:checked'))
        .map(checkbox => checkbox.dataset.professionalId);

    const services = Array.from(document.querySelectorAll('#forester-service-checkboxes input:checked')).map(cb => cb.value);
      
    const goalRadioButton = document.querySelector('input[name="landowner-goal"]:checked');
    const landownerGoal = goalRadioButton ? goalRadioButton.value : 'General Assessment & Advice';
      
    const landownerMessage = document.getElementById('landowner-message').value.trim();

    if (selectedProfessionalIds.length === 0) {
        showToast("Please select at least one professional to send an inquiry to.", "error");
        button.disabled = false;
        button.textContent = 'Send Inquiry';
        return;
    }
      
    const roleTitle = document.getElementById('invite-modal-title').textContent;
    if (roleTitle.includes('Foresters') && services.length === 0) {
        showToast("Please select at least one service you are interested in.", "error");
        button.disabled = false;
        button.textContent = 'Send Inquiry';
        return;
    }

    try {
        const project = await createNewInquiryProject(db, currentUser, property, services, selectedProfessionalIds);
          
        const propertyRef = doc(db, "properties", propertyId);
        const batch = writeBatch(db);

        selectedProfessionalIds.forEach(id => {
            batch.update(propertyRef, { authorizedUsers: arrayUnion(id) });
        });

        let detailedMessage = `A Landowner is requesting services for "${property.name}".\n\n`;
        detailedMessage += `Primary Goal: ${landownerGoal}\n`;
        if (services.length > 0) {
            detailedMessage += `Services of Interest:\n- ${services.join('\n- ')}\n\n`;
        }
        if (landownerMessage) {
            detailedMessage += `Additional Message:\n"${landownerMessage}"`;
        }

        selectedProfessionalIds.forEach(profId => {
            const professionalProfile = allProfessionalProfiles.find(p => p.id === profId);
            const inquiryData = {
                projectId: project.id,
                fromUserId: currentUser.uid,
                fromUserName: currentUser.username,
                toUserId: profId,
                toUserName: professionalProfile?.username || 'Professional',
                propertyId: property.id,
                propertyName: property.name,
                message: detailedMessage,
                landownerGoal: landownerGoal,
                servicesRequested: services,
                involvedUsers: [currentUser.uid, profId],
                status: 'pending',
                createdAt: serverTimestamp()
            };
            const newInquiryRef = doc(collection(db, "inquiries"));
            batch.set(newInquiryRef, inquiryData);
        });
          
        await batch.commit();
          
        closeModal('invite-forester-modal');
        showToast(`Your detailed inquiry has been sent! You can track responses in "My Projects".`, "success");
          
        await onUserStatusChange(currentUser);
        window.location.hash = '#my-projects';

    } catch (error) {
        console.error("Error sending inquiries:", error);
        showToast(`There was an error sending your inquiries. ${error.message}`, "error");
    } finally {
        button.disabled = false;
        button.textContent = 'Send Inquiry';
    }
}

export async function handleAcceptQuote(quoteId, projectId) {
    const confirmed = await showConfirmationModal(
        "Accept Quote?",
        "Are you sure you want to accept this quote? This will formally engage the professional for this project."
    );
    if (!confirmed) return;

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.classList.remove('hidden');

    try {
        const result = await callAcceptQuote(quoteId, projectId);
        if (result.success) {
            showToast("Quote accepted successfully! The project has been updated.", "success");
            closeModal('view-quotes-modal');
            await onUserStatusChange(currentUser);
            window.location.hash = '#my-projects';
        }
    } catch (error) {
        console.error("Failed to accept quote:", error);
        showToast(`Error: ${error.message}`, "error");
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

export async function handleDeclineInquiry(event) {
    event.preventDefault();
    const inquiryId = document.getElementById('decline-inquiry-id').value;

    try {
        await updateInquiryStatus(db, inquiryId, 'declined');
        await onUserStatusChange(currentUser);
        closeModal('decline-modal');
        showToast("Inquiry declined.", "info");
    } catch (error) {
        console.error("Error declining inquiry:", error);
        showToast("Failed to decline inquiry. Please try again.", "error");
    }
}

export async function handleCancelInquiry(inquiryId) {
    const confirmed = await showConfirmationModal(
        "Withdraw Inquiry?",
        "Are you sure you want to withdraw this inquiry? The professional will be notified."
    );
    if (!confirmed) return;

    try {
        const inquiryToCancel = allInquiries.find(i => i.id === inquiryId);
        if (!inquiryToCancel) throw new Error("Inquiry not found.");

        await updateInquiryStatus(db, inquiryId, 'withdrawn');

        const otherInquiriesForProject = allInquiries.filter(i => 
            i.projectId === inquiryToCancel.projectId && i.id !== inquiryId
        );

        const areAllOthersResolved = otherInquiriesForProject.every(i => 
            i.status === 'withdrawn' || i.status === 'declined'
        );

        if (otherInquiriesForProject.length === 0 || areAllOthersResolved) {
            await deleteDoc(doc(db, "projects", inquiryToCancel.projectId));
        }
          
        await onUserStatusChange(currentUser);
          
    } catch (error) {
        console.error("Error withdrawing inquiry:", error);
        showToast("Failed to withdraw inquiry. Please try again.", "error");
    }
}

export async function handleDeclineProject(projectId) {
    const confirmed = await showConfirmationModal(
        "Decline Project?",
        "Are you sure you want to decline this project? The landowner will be notified and will need to select another professional."
    );
    if (!confirmed) return;

    try {
        await updateProject(db, projectId, {
            status: 'inquiry',
            foresterId: deleteField(),
            quoteAcceptedAt: deleteField()
        });
        showToast("Project declined. The landowner has been notified.", "info");
        await onUserStatusChange(currentUser);
        window.location.hash = '#my-projects';
    } catch (error) {
        console.error("Error declining project:", error);
        showToast("Failed to decline project.", "error");
    }
}

export async function handleUpdateProfile(event) {
    event.preventDefault();
    if (!currentUser) return;

    const updatedData = {
        username: document.getElementById('edit-username').value.trim(),
        profilePictureUrl: document.getElementById('edit-profile-picture-url').value.trim(),
        company: document.getElementById('edit-company').value.trim(),
        bio: document.getElementById('edit-bio').value.trim(),
    };
      
    const role = currentUser.role;
    if (role !== 'landowner') {
        const location = getUpdatedLocation();
        if (location) updatedData.location = { lat: location.lat, lng: location.lng };
        updatedData.serviceRadius = parseInt(document.getElementById('edit-service-radius-slider').value, 10);
          
        if (role === 'forester') {
            updatedData.experience = document.getElementById('edit-forester-experience').value;
            updatedData.certs = document.getElementById('edit-forester-certs').value;
            updatedData.specialties = Array.from(document.querySelectorAll('#edit-forester-specialties input:checked')).map(box => box.value);
        } else if (role === 'timber-buyer') {
            updatedData.mills = document.getElementById('edit-buyer-mills').value;
            updatedData.products = Array.from(document.querySelectorAll('#edit-buyer-products input:checked')).map(box => box.value);
        } else if (role === 'logging-contractor') {
            updatedData.experience = document.getElementById('edit-logger-experience').value;
            updatedData.equipment = document.getElementById('edit-logger-equipment').value;
            updatedData.insurance = document.getElementById('edit-logger-insurance').checked;
            updatedData.services = Array.from(document.querySelectorAll('#edit-logger-services input:checked')).map(box => box.value);
        } else if (role === 'service-provider') {
            updatedData.insurance = document.getElementById('edit-service-insurance').checked;
            updatedData.services = Array.from(document.querySelectorAll('#edit-service-provider-services input:checked')).map(box => box.value);
        }
    }

    try {
        await updateUserProfile(db, currentUser.uid, updatedData);
        setCurrentUser({ ...currentUser, ...updatedData }); 
        renderMyProfile();
        closeModal('edit-profile-modal');
        showToast('Profile updated successfully!', "success");
    } catch (error) {
        console.error("Error updating profile:", error);
        showToast("Failed to update profile. Please try again.", "error");
    }
}

export function getSignupOptionalData() {
    const role = document.getElementById('signup-role').value;
    const optionalData = {
        company: document.getElementById('signup-company').value.trim(),
        bio: document.getElementById('signup-bio').value.trim(),
        profilePictureUrl: document.getElementById('signup-profile-picture-url').value.trim(),
    };

    if (role !== 'landowner') {
        const location = getUpdatedLocation();
        if (location) optionalData.location = location;
        optionalData.serviceRadius = parseInt(document.getElementById('signup-service-radius-slider').value, 10);

        if (role === 'forester') {
            optionalData.experience = document.getElementById('signup-forester-experience').value;
            optionalData.certs = document.getElementById('edit-forester-certs').value;
            optionalData.specialties = Array.from(document.querySelectorAll('#signup-forester-specialties input:checked')).map(box => box.value);
        } else if (role === 'timber-buyer') {
            optionalData.mills = document.getElementById('edit-buyer-mills').value;
            optionalData.products = Array.from(document.querySelectorAll('#edit-buyer-products input:checked')).map(box => box.value);
        } else if (role === 'logging-contractor') {
            optionalData.experience = document.getElementById('signup-logger-experience').value;
            optionalData.equipment = document.getElementById('edit-logger-equipment').value;
            optionalData.insurance = document.getElementById('signup-logger-insurance').checked;
            optionalData.services = Array.from(document.querySelectorAll('#signup-logger-services input:checked')).map(box => box.value);
        } else if (role === 'service-provider') {
            optionalData.insurance = document.getElementById('signup-service-insurance').checked;
            optionalData.services = Array.from(document.querySelectorAll('#edit-service-provider-services input:checked')).map(box => box.value);
        }
    }
    return optionalData;
}

export async function handleLogLoadSubmit(event) {
    event.preventDefault();
    if (!currentUser) {
        showToast("You must be logged in to submit a ticket.", "error");
        return;
    }
      
    const submitButton = event.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';

    try {
        const ticketData = {
            submitterId: currentUser.uid,
            submitterName: currentUser.username,
            jobId: document.getElementById('load-job').value,
            dateTime: document.getElementById('load-date').value,
            mill: document.getElementById('load-mill').value,
            product: document.getElementById('load-product').value,
            grossWeight: parseFloat(document.getElementById('load-gross-weight').value) || 0,
            tareWeight: parseFloat(document.getElementById('load-tare-weight').value) || 0,
            netTons: parseFloat(document.getElementById('load-net-weight').textContent) || 0,
            ticketImageUrl: null 
        };

        if (!ticketData.jobId) {
            throw new Error("Please select a job.");
        }
          
        const project = allProjects.find(p => p.id === ticketData.jobId);
        if(project) {
            ticketData.ownerId = project.ownerId;
            ticketData.supplierId = project.supplierId;
        }

        const photoInput = document.getElementById('load-ticket-photo');
        const file = photoInput.files[0];

        if (file) {
            submitButton.textContent = 'Uploading Image...';
            const storage = getStorage(app);
            const filePath = `haul-tickets/${currentUser.uid}/${Date.now()}-${file.name}`;
            const storageRef = ref(storage, filePath);
            
            const snapshot = await uploadBytes(storageRef, file);
            ticketData.ticketImageUrl = await getDownloadURL(snapshot.ref);
            submitButton.textContent = 'Saving Ticket...';
        }

        await saveHaulTicket(db, ticketData);

        showToast("Haul ticket submitted successfully!", "success");
        event.target.reset();
        document.getElementById('btn-view-loads').click();

    } catch (error) {
        console.error("Error submitting haul ticket:", error);
        showToast(`There was an error submitting your ticket: ${error.message}`, "error");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit Ticket';
    }
}

export function calculateNetWeight() {
    const gross = parseFloat(document.getElementById('load-gross-weight').value) || 0;
    const tare = parseFloat(document.getElementById('load-tare-weight').value) || 0;
    const netTons = gross > tare ? ((gross - tare) / 2000).toFixed(2) : '0.00';
    document.getElementById('load-net-weight').textContent = netTons;
}

export async function handleSaveRateSheet(event) {
    event.preventDefault();
    const projectId = document.getElementById('rate-sheet-project-id').value;
    const rateSetElements = document.querySelectorAll('#rate-sets-container .rate-set');
      
    const rateSets = [];
    let isValid = true;

    rateSetElements.forEach(setElement => {
        const effectiveDate = setElement.querySelector('.rate-set-effective-date').value;
        if (!effectiveDate) {
            isValid = false;
        }

        const rateSet = { effectiveDate, mill: [], stumpage: [], logging: [] };

        const categories = ['mill', 'stumpage', 'logging'];
        categories.forEach(category => {
            const rowsContainer = setElement.querySelector(`.${category}-rates-container`);
            const rows = rowsContainer.querySelectorAll('.rate-row');
            rows.forEach(row => {
                const product = row.querySelector('.rate-product').value;
                const price = parseFloat(row.querySelector('.rate-price').value);
                if (product && !isNaN(price)) {
                    rateSet[category].push({ product, price });
                }
            });
        });
        rateSets.push(rateSet);
    });

    if (!isValid) {
        showToast("Please ensure every rate set has an effective date.", "error");
        return;
    }
      
    const submitButton = event.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';

    try {
        await saveProjectRates(db, projectId, rateSets);
        const projectIndex = allProjects.findIndex(p => p.id === projectId);
        if (projectIndex > -1) {
            allProjects[projectIndex].rateSets = rateSets;
        }
        showToast("Project rates saved successfully!", "success");
        closeModal('rate-sheet-modal');
    } catch (error) {
        console.error("Error saving rates:", error);
        showToast("Could not save project rates. Please try again.", "error");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Save All Rates';
    }
}

export async function handleSendMessage(event) {
    event.preventDefault();
    if (!currentUser) return;

    const projectId = document.getElementById('project-chat-project-id').value;
    const messageInput = document.getElementById('project-chat-message');
    const message = messageInput.value.trim();
    const submitButton = event.target.querySelector('button[type="submit"]');

    if (!message || !projectId) return;

    submitButton.disabled = true;

    try {
        await saveProjectMessage(db, projectId, currentUser, message);
        messageInput.value = ''; 
    } catch (error) {
        console.error("Error sending message:", error);
        showToast("Could not send your message. Please try again.", "error");
    } finally {
        submitButton.disabled = false;
    }
}

export async function handleUpdateLoadSubmit(event) {
    event.preventDefault();
    if (!currentUser) return;

    const ticketId = document.getElementById('edit-load-ticket-id').value;
    const submitButton = event.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';

    try {
        const updatedData = {
            dateTime: document.getElementById('edit-load-date').value,
            mill: document.getElementById('edit-load-mill').value,
            product: document.getElementById('edit-load-product').value,
            grossWeight: parseFloat(document.getElementById('edit-load-gross-weight').value) || 0,
            tareWeight: parseFloat(document.getElementById('edit-load-tare-weight').value) || 0,
            netTons: parseFloat(document.getElementById('edit-load-net-weight').textContent) || 0,
        };

        const photoInput = document.getElementById('edit-load-ticket-photo');
        const file = photoInput.files[0];

        if (file) {
            submitButton.textContent = 'Uploading Image...';
            const storage = getStorage(app);
            const filePath = `haul-tickets/${currentUser.uid}/${Date.now()}-${file.name}`;
            const storageRef = ref(storage, filePath);
            
            const snapshot = await uploadBytes(storageRef, file);
            updatedData.ticketImageUrl = await getDownloadURL(snapshot.ref);
            submitButton.textContent = 'Saving Changes...';
        }

        await updateHaulTicket(db, ticketId, updatedData);
        
        showToast("Haul ticket updated successfully!", "success");
        closeModal('edit-load-modal');

    } catch (error) {
        console.error("Error updating haul ticket:", error);
        showToast("Failed to update haul ticket. Please try again.", "error");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Save Changes';
    }
}