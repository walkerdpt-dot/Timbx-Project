import { getMarketplaceDataFromSession } from './firestore.js';

document.addEventListener('DOMContentLoaded', () => {
  const contentDiv = document.getElementById('details-content');
  const params = new URLSearchParams(window.location.search);
  const itemId = params.get('id');
  const itemType = params.get('type');

  if (!itemId || !itemType) {
    contentDiv.innerHTML = '<p class="text-red-500">Error: Could not find the requested item.</p>';
    return;
  }

  const { properties, profiles } = getMarketplaceDataFromSession();

  if (itemType === 'property') {
    const property = properties.find(p => p.id === itemId);
    renderPropertyDetails(property, contentDiv);
  } else if (['forester', 'buyer', 'contractor'].includes(itemType)) {
    const profile = profiles.find(p => p.uid === itemId);
    renderProfileDetails(profile, contentDiv);
  }
});

function renderPropertyDetails(prop, container) {
  if (!prop) {
    container.innerHTML = '<p class="text-red-500">Property not found.</p>';
    return;
  }
  container.innerHTML = `
    <h2 class="text-3xl font-bold text-green-800 mb-4">${prop.name}</h2>
    <p class="text-gray-600 mb-2"><strong>Owner:</strong> ${prop.ownerUsername}</p>
    <p class="text-gray-600 mb-2"><strong>Service Offered:</strong> ${prop.serviceType}</p>
    <p class="text-gray-600 mb-2"><strong>Dominant Timber Type:</strong> ${prop.timberType}</p>
    <p class="text-gray-600 mb-2"><strong>Dominant Species:</strong> ${prop.species}</p>
    <p class="text-gray-600 mb-4"><strong>Approx. Age:</strong> ${prop.age} years</p>
    <div class="border-t pt-4">
      <h3 class="text-xl font-semibold text-gray-800 mb-2">Description</h3>
      <p class="text-gray-700">${prop.description || 'No description provided.'}</p>
    </div>
  `;
}

function renderProfileDetails(prof, container) {
  if (!prof) {
    container.innerHTML = '<p class="text-red-500">Profile not found.</p>';
    return;
  }
  const role = prof.role.charAt(0).toUpperCase() + prof.role.slice(1);
  container.innerHTML = `
    <h2 class="text-3xl font-bold text-green-800 mb-2">${prof.username}</h2>
    <p class="text-gray-600 font-semibold text-lg mb-4">Role: ${role}</p>
    <div class="border-t pt-4">
      <p class="text-gray-700 mb-2"><strong>Member Since:</strong> ${prof.createdAt?.toDate ? prof.createdAt.toDate().toLocaleDateString() : 'N/A'}</p>
      <p class="text-gray-700 mb-2"><strong>Rating:</strong> ${prof.rating?.toFixed(1) || 'N/A'}/5.0 (${prof.reviewCount || 0} reviews)</p>
      <p class="text-gray-700 mb-2"><strong>Completed Transactions:</strong> ${prof.completedTransactions || 0}</p>
    </div>
  `;
}
