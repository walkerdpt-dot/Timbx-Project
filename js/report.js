// js/report.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { firebaseConfig } from './config.js';
import { getPropertyById, getUserProfileById } from './firestore.js';
import { createHybridLayer } from './map.js';

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- Global map instances ---
let locationMap, aerialMap, topoMap;

// --- Helper Functions ---
function sanitizeGeoJSON(geoJSON) {
    if (!geoJSON) return null;
    let parsedGeoJSON = geoJSON;
    while (typeof parsedGeoJSON === 'string') {
        try {
            parsedGeoJSON = JSON.parse(parsedGeoJSON);
        } catch (e) {
            console.error("Failed to parse GeoJSON string:", geoJSON);
            return null;
        }
    }
    return parsedGeoJSON;
}

// --- DOMContentLoaded Listener ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const params = new URLSearchParams(window.location.search);
            const projectId = params.get('projectId');
            
            document.getElementById('back-button').href = `index.html#my-projects?projectId=${projectId}`;

            if (!projectId) {
                document.body.innerHTML = '<p class="text-red-500 p-8 text-center">Error: No project ID specified.</p>';
                return;
            }

            try {
                const projectRef = doc(db, "projects", projectId);
                const projectSnap = await getDoc(projectRef);

                if (!projectSnap.exists()) {
                    throw new Error("Project not found.");
                }
                const project = { id: projectSnap.id, ...projectSnap.data() };

                const [property, owner, forester] = await Promise.all([
                    getPropertyById(db, project.propertyId),
                    getUserProfileById(db, project.ownerId),
                    project.foresterId ? getUserProfileById(db, project.foresterId) : Promise.resolve(null)
                ]);

                if (!property) throw new Error("Associated property data not found.");

                renderReport(project, property, owner, forester);

            } catch (error) {
                console.error("Error loading report data:", error);
                document.body.innerHTML = `<p class="text-red-500 p-8 text-center">Error: Could not load report data. ${error.message}</p>`;
            }
        } else {
            document.body.innerHTML = '<p class="text-yellow-700 p-8 text-center">Please sign in to view this report.</p>';
        }
    });
});

// --- Main Rendering Function ---
function renderReport(project, property, owner, forester) {
    const cruiseDetails = project.cruiseData.details;
    
    document.title = `${cruiseDetails.saleName} | Timber Sale Report`;
    document.getElementById('report-sale-name').textContent = cruiseDetails.saleName || 'Unnamed Sale';
    
    let ownerInfo = `Offered by: ${owner.username}`;
    if (forester) {
        ownerInfo += ` | Marketed by: ${forester.username}`;
    }
    document.getElementById('report-owner-info').textContent = ownerInfo;

    document.getElementById('report-location').textContent = `${cruiseDetails.county}, ${cruiseDetails.state}`;
    document.getElementById('report-acreage').textContent = `${cruiseDetails.acreage} acres (approx.)`;
    document.getElementById('report-legal-desc').textContent = cruiseDetails.legalDesc || 'N/A';
    document.getElementById('report-bid-method').textContent = cruiseDetails.bidMethod === 'lump-sum' ? 'Lump Sum Sealed Bid' : 'Pay-as-Cut (Per Unit)';
    document.getElementById('report-access-desc').textContent = cruiseDetails.accessDescription || 'N/A';
    const bidDate = new Date(cruiseDetails.bidDeadline + 'T00:00:00');
    document.getElementById('report-bid-deadline').textContent = bidDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const specsContainer = document.getElementById('report-specifications-container');
    specsContainer.innerHTML = `
        <p class="spec-paragraph"><strong>Harvest Description:</strong> ${cruiseDetails.harvestDescription || 'N/A'}</p>
        <p class="spec-paragraph"><strong>Boundary Line Description:</strong> ${cruiseDetails.boundaryDescription || 'N/A'}</p>
        <p class="spec-paragraph"><strong>Logging Conditions:</strong> ${cruiseDetails.loggingConditions || 'N/A'}</p>
        <p class="spec-paragraph"><strong>Streamside Management Zones (SMZs):</strong> ${cruiseDetails.smzRules || 'As per state BMPs.'}</p>
        <p class="spec-paragraph"><strong>Stump Height:</strong> ${cruiseDetails.stumpHeight ? `Maximum stump height is ${cruiseDetails.stumpHeight} inches.` : 'N/A'}</p>
        <p class="spec-paragraph"><strong>Contract Length:</strong> ${cruiseDetails.contractLength ? `The contract length is ${cruiseDetails.contractLength} months from the date of closing.` : 'N/A'}</p>
        <p class="spec-paragraph"><strong>Performance Bond:</strong> ${cruiseDetails.performanceBondAmount || 'A performance bond is not required.'}</p>
        <p class="spec-paragraph"><strong>Insurance Requirements:</strong> General Liability of ${cruiseDetails.insuranceGli || 'N/A'} and Worker's Compensation of ${cruiseDetails.insuranceWc || 'N/A'} is required.</p>
        <p class="spec-paragraph"><strong>Other Conditions / Remarks:</strong> ${cruiseDetails.moreConditions || 'None specified.'}</p>
    `;
    
    if(forester) {
        document.getElementById('report-contact-info').innerHTML = `
            <p>For questions or to arrange a tract inspection, please contact:</p>
            <p class="font-bold mt-2">${forester.username}</p>
            <p>${forester.company || ''}</p>
            <p>Email: ${forester.email || 'N/A'}</p>
        `;
    }

    document.getElementById('report-generation-date').textContent = new Date().toLocaleDateString();

    renderInventoryTables(project.cruiseData.inventory);
    renderSummaryTables(project.cruiseData.inventory, cruiseDetails);
    
    // A delay gives the fixed-width layout time to settle before we initialize the maps.
    setTimeout(() => {
        initReportMaps(property.geoJSON, project.cruiseData.annotations, cruiseDetails);
    }, 500); 
}

function renderInventoryTables(inventory) {
    const container = document.getElementById('report-inventory-container');
    container.innerHTML = '';

    inventory.forEach(stand => {
        const standAcreage = stand.netAcres || 0;
        let standHTML = `<div><h3>Stand: ${stand.name} (${standAcreage.toFixed(1)} Acres)</h3>`;
        
        stand.products.forEach(product => {
            standHTML += `<h4 class="font-semibold mt-3 mb-1">${product.product}</h4>
                          <table class="report-table">
                              <thead>
                                  <tr>
                                      <th>DBH</th>
                                      <th>Trees</th>
                                      <th>Volume (Tons)</th>
                                      <th>Trees / Acre</th>
                                      <th>Volume / Acre (Tons)</th>
                                  </tr>
                              </thead>
                              <tbody>`;
            product.breakdown.forEach(b => {
                standHTML += `<tr>
                                  <td>${b.dbh}</td>
                                  <td>${b.trees.toLocaleString()}</td>
                                  <td>${b.volume.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                  <td>${standAcreage > 0 ? (b.trees / standAcreage).toFixed(1) : 'N/A'}</td>
                                  <td>${standAcreage > 0 ? (b.volume / standAcreage).toFixed(2) : 'N/A'}</td>
                              </tr>`;
            });
            standHTML += `</tbody></table>`;
        });
        standHTML += `</div>`;
        container.innerHTML += standHTML;
    });
}

function renderSummaryTables(inventory, cruiseDetails) {
    const summaryContainer = document.getElementById('report-summary-container');
    const page1Container = document.getElementById('report-page1-summary-container');
    summaryContainer.innerHTML = '';
    page1Container.innerHTML = '';
    
    const totals = {};
    const PINE_SAW_CONVERSION = 8.0;
    const HARDWOOD_SAW_CONVERSION = 9.0;

    inventory.forEach(stand => {
        stand.products.forEach(product => {
            if (!totals[product.product]) {
                totals[product.product] = { trees: 0, tons: 0 };
            }
            product.breakdown.forEach(b => {
                totals[product.product].trees += b.trees;
                if (b.units.toLowerCase() === 'tons') {
                    totals[product.product].tons += b.volume;
                }
            });
        });
    });

    const sawtimberProducts = Object.entries(totals).filter(([name]) => name.toLowerCase().includes('sawtimber'));
    const pulpwoodProducts = Object.entries(totals).filter(([name]) => !name.toLowerCase().includes('sawtimber'));

    let totalSawTrees = 0, totalSawTons = 0, totalSawMbf = 0;
    let sawtimberHTML = `
        <div>
            <h4 class="font-bold text-center">ESTIMATED SAWTIMBER VOLUMES</h4>
            <table class="report-table">
                <thead><tr><th>Product</th><th class="text-right">Trees</th><th class="text-right">Tons</th><th class="text-right">MBF (Doyle)</th></tr></thead>
                <tbody>`;
    sawtimberProducts.forEach(([product, data]) => {
        const isPine = product.toLowerCase().includes('pine');
        const mbf = data.tons / (isPine ? PINE_SAW_CONVERSION : HARDWOOD_SAW_CONVERSION);
        totalSawTrees += data.trees;
        totalSawTons += data.tons;
        totalSawMbf += mbf;
        sawtimberHTML += `
            <tr>
                <td>${product}</td>
                <td class="text-right">${data.trees.toLocaleString()}</td>
                <td class="text-right">${data.tons.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td class="text-right">${mbf.toFixed(2)}</td>
            </tr>`;
    });
    sawtimberHTML += `</tbody><tfoot>
                        <tr>
                            <td>Sawtimber Totals</td>
                            <td class="text-right">${totalSawTrees.toLocaleString()}</td>
                            <td class="text-right">${totalSawTons.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                            <td class="text-right">${totalSawMbf.toFixed(2)}</td>
                        </tr>
                      </tfoot></table></div>`;

    let totalPulpTrees = 0, totalPulpTons = 0;
    let pulpwoodHTML = `
        <div>
            <h4 class="font-bold text-center">ESTIMATED PULPWOOD VOLUMES</h4>
            <table class="report-table">
                <thead><tr><th>Product</th><th class="text-right">Trees</th><th class="text-right">Tons</th></tr></thead>
                <tbody>`;
    pulpwoodProducts.forEach(([product, data]) => {
        totalPulpTrees += data.trees;
        totalPulpTons += data.tons;
        pulpwoodHTML += `
            <tr>
                <td>${product}</td>
                <td class="text-right">${data.trees.toLocaleString()}</td>
                <td class="text-right">${data.tons.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            </tr>`;
    });
    pulpwoodHTML += `</tbody><tfoot>
                        <tr>
                            <td>Pulpwood Totals</td>
                            <td class="text-right">${totalPulpTrees.toLocaleString()}</td>
                            <td class="text-right">${totalPulpTons.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        </tr>
                     </tfoot></table></div>`;
    
    summaryContainer.innerHTML = sawtimberHTML + pulpwoodHTML;
    
    document.getElementById('report-page1-summary-title').innerHTML = `&plusmn; ${cruiseDetails.acreage} ${cruiseDetails.harvestDescription} Acres`;
    let page1SummaryHTML = `<table class="report-table">
                                <thead><tr><th>Product</th><th class="text-right">Total Trees</th><th class="text-right">Total Tons</th></tr></thead>
                                <tbody>`;
    Object.entries(totals).sort(([a], [b]) => a.localeCompare(b)).forEach(([product, data]) => {
        page1SummaryHTML += `<tr><td>${product}</td><td class="text-right">${data.trees.toLocaleString()}</td><td class="text-right">${data.tons.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>`;
    });
    page1SummaryHTML += `</tbody><tfoot>
                            <tr>
                                <td>Grand Total</td>
                                <td class="text-right">${(totalSawTrees + totalPulpTrees).toLocaleString()}</td>
                                <td class="text-right">${(totalSawTons + totalPulpTons).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                            </tr>
                         </tfoot></table>`;
    page1Container.innerHTML = page1SummaryHTML;
}

function initReportMaps(propertyGeoJSON, annotations, cruiseDetails) {
    const cleanPropertyGeoJSON = sanitizeGeoJSON(propertyGeoJSON);
    if (!cleanPropertyGeoJSON) return;

    const propertyLayer = L.geoJSON(cleanPropertyGeoJSON);
    const propertyBounds = propertyLayer.getBounds(); 
    if (!propertyBounds.isValid()) return;

    const mapOptions = {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false
    };
    
    const mapHeaderInfo = `${cruiseDetails.saleName}<br>${cruiseDetails.legalDesc || ''}, ${cruiseDetails.county} County<br>Containing ${cruiseDetails.acreage} acres`;
    document.getElementById('map-header-location').innerHTML = mapHeaderInfo;
    document.getElementById('map-header-topo').innerHTML = mapHeaderInfo;
    document.getElementById('map-header-aerial').innerHTML = mapHeaderInfo;

    // --- Location Map (Hybrid) ---
    locationMap = L.map('report-map-location', mapOptions);
    locationMap.createPane('boundaries');
    locationMap.getPane('boundaries').style.zIndex = 650;
    createHybridLayer().addTo(locationMap);
    L.geoJSON(cleanPropertyGeoJSON, { style: { color: '#E6194B', weight: 3, fillOpacity: 0.4 }}).addTo(locationMap);
    L.control.scale().addTo(locationMap);
    locationMap.invalidateSize();
    locationMap.setView(propertyBounds.getCenter(), 12);

    // --- Aerial Map (Hybrid) ---
    aerialMap = L.map('report-map-aerial', mapOptions);
    aerialMap.createPane('boundaries');
    aerialMap.getPane('boundaries').style.zIndex = 650;
    createHybridLayer().addTo(aerialMap);
    drawBoundaries(aerialMap, cleanPropertyGeoJSON, annotations, true);
    L.control.scale().addTo(aerialMap);
    aerialMap.invalidateSize();
    aerialMap.fitBounds(propertyBounds, { padding: [50, 50] });
    
    // --- Topo Map (OpenTopoMap) ---
    topoMap = L.map('report-map-topo', mapOptions);
    topoMap.createPane('boundaries');
    topoMap.getPane('boundaries').style.zIndex = 650;
    L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)'
    }).addTo(topoMap);
    drawBoundaries(topoMap, cleanPropertyGeoJSON, annotations, true);
    L.control.scale().addTo(topoMap);
    topoMap.invalidateSize();
    topoMap.fitBounds(propertyBounds, { padding: [50, 50] });

    renderMapLegend(annotations);

    // This listener makes the final, small adjustments needed for a perfect printout.
    const printMediaQuery = window.matchMedia('print');
    function resizeMapsForPrint() {
        if (locationMap) {
            locationMap.invalidateSize();
            locationMap.setView(propertyBounds.getCenter(), 12);
        }
        if (aerialMap) {
            aerialMap.invalidateSize();
            aerialMap.fitBounds(propertyBounds, { padding: [50, 50] });
        }
        if (topoMap) {
            topoMap.invalidateSize();
            topoMap.fitBounds(propertyBounds, { padding: [50, 50] });
        }
    }
    printMediaQuery.addEventListener('change', (e) => {
        if (e.matches) {
            resizeMapsForPrint();
        }
    });
}

function drawBoundaries(mapInstance, propertyGeoJSON, annotations, showLabels = false) {
    L.geoJSON(propertyGeoJSON, {
        style: { color: '#22c55e', weight: 3, fill: false, dashArray: '10, 10' }
    }).addTo(mapInstance);
    
    const cleanAnnotations = sanitizeGeoJSON(annotations);
    if (cleanAnnotations) {
        L.geoJSON(cleanAnnotations, {
            onEachFeature: (feature, layer) => {
                if (showLabels && feature.properties?.label) {
                    layer.bindTooltip(feature.properties.label, { permanent: true, direction: 'center', className: 'map-label', opacity: 0.8 });
                }
                if (feature.properties?.color && typeof layer.setStyle === 'function') {
                    layer.setStyle({ color: feature.properties.color, fillColor: feature.properties.color, fillOpacity: 0.4 });
                }
            }
        }).addTo(mapInstance);
    }
}

function renderMapLegend(annotations) {
    const legendContainer = document.getElementById('report-map-legend');
    const topoLegendContainer = document.getElementById('report-map-legend-topo');
    if (!legendContainer || !topoLegendContainer) return;

    const cleanAnnotations = sanitizeGeoJSON(annotations);
    const features = cleanAnnotations?.features || [];
    
    let legendHTML = `<h4 class="font-semibold mb-2">Map Legend</h4><div class="space-y-1 grid grid-cols-2 gap-x-4">`;
    
    legendHTML += `
        <div class="flex items-center text-xs">
            <span class="inline-block w-4 h-4 mr-2 border-2 border-dashed" style="border-color: #22c55e;"></span>
            <span><strong>Property Boundary</strong></span>
        </div>`;

    if (features.length > 0) {
        features.forEach(feature => {
            const props = feature.properties;
            let symbolHTML = '';
            const color = props.color || '#000000';
            
            switch (feature.geometry.type) {
                case 'Polygon':
                case 'MultiPolygon':
                    symbolHTML = `<span class="inline-block w-4 h-4 mr-2 border" style="background-color: ${color}66; border-color: ${color};"></span>`;
                    break;
                case 'LineString':
                case 'MultiLineString':
                    symbolHTML = `<span class="inline-block w-4 h-1 mr-2 -translate-y-1 border-t-2 border-b-2" style="border-color: ${color};"></span>`;
                    break;
                case 'Point':
                    symbolHTML = `<span class="inline-block w-4 h-4 mr-2 rounded-full border border-black" style="background-color: ${color};"></span>`;
                    break;
            }
            
            const acreageText = (props.acreage > 0) ? `: ${props.acreage.toFixed(2)} acres` : '';
                
            legendHTML += `
                <div class="flex items-center text-xs">
                    ${symbolHTML}
                    <span><strong>${props.label}</strong> (${props.type})${acreageText}</span>
                </div>
            `;
        });
    }
    legendHTML += '</div>';
    legendContainer.innerHTML = legendHTML;
    topoLegendContainer.innerHTML = legendHTML;
}