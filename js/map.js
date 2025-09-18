// js/map.js
export const mapInstances = new Map();
let lastDrawnLayer;
export let saleMapFeatures = [];
export let myPropertiesLayerGroup = null;
let locationMarker = null;
let serviceAreaCircle = null;

// Brighter, but still "Earthy" Color Palette (Green removed)
const DRAW_FILL_PALETTE = [
    '#D9A23D', // Amber/Ochre
    '#9D8DF1', // Light Purple
    '#CD5C5C', // Indian Red / Terracotta
    '#6A8D92', // Slate Blue/Gray
    '#B58463'  // Sienna Brown
];
const DRAW_BORDER_PALETTE = [
    '#B3862D', // Darker Amber
    '#6D5BA7', // Darker Purple
    '#A54B4B', // Darker Red
    '#496266', // Darker Slate
    '#8B4513'  // Saddle Brown
];


/**
 * Creates the standard hybrid map view (Satellite + Labels + Roads).
 * This is a reusable function to ensure map consistency.
 * @returns {L.LayerGroup} A Leaflet LayerGroup containing the hybrid map layers.
 */
export function createHybridLayer() {
    // CORRECTED: This combines THREE layers for the perfect hybrid view.
    // 1. The base satellite imagery.
    // 2. A transparent layer for roads and highways.
    // 3. A transparent layer for city labels and major boundaries.
    return L.layerGroup([
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
             attribution: 'Tiles &copy; Esri'
        }),
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
            pane: 'shadowPane' // Use a custom pane to ensure it's on top of imagery
        }),
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
            pane: 'shadowPane' // Use the same custom pane
        })
    ]);
}


function createBaseMap(containerId, mapOptions = {}, view = [34.7465, -92.2896, 7]) {
    if (mapInstances.has(containerId)) {
        const oldMap = mapInstances.get(containerId);
        if (oldMap) oldMap.remove();
    }
      
    const mapContainer = document.getElementById(containerId);
    if (!mapContainer) {
        console.error(`Map container with ID "${containerId}" not found.`);
        return null;
    }
    mapContainer.innerHTML = '';

    const map = L.map(containerId, mapOptions).setView(view.slice(0, 2), view[2]);

    // This pane is used by the hybrid layer to ensure labels are on top.
    map.createPane('shadowPane');
    map.getPane('shadowPane').style.zIndex = 650;
    map.getPane('shadowPane').style.pointerEvents = 'none';

    addLayerControls(map);
      
    mapInstances.set(containerId, map);
    return map;
}

export function addLayerControls(map) {
    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });

    const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)'
    });

    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
    });
  
    const hybrid = createHybridLayer();

    const baseMaps = {
        "Hybrid": hybrid,
        "Satellite": satellite,
        "Topographic": topo,
        "Streets": streets
    };

    hybrid.addTo(map);
    L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);
}

export function getDrawnHarvestAreas() {
    return saleMapFeatures
        .map(item => ({
            label: item.label,
            acreage: item.acreage,
            color: item.layer.options.color,
            fillColor: item.layer.options.fillColor,
            type: item.type
        }));
}


export function getMapInstance(mapId) {
    return mapInstances.get(mapId) || null;
}

export function initGlobalMap() {
    const map = createBaseMap('global-map');
    if (map) {
        L.Control.geocoder({
            defaultMarkGeocode: false,
            position: 'topleft',
            placeholder: 'Search for a location...'
        }).on('markgeocode', function(e) {
            map.fitBounds(e.geocode.bbox);
        }).addTo(map);
    }
    return map;
}

export function initMyPropertiesMap() {
    const map = createBaseMap('my-properties-map');
    if (map) {
        myPropertiesLayerGroup = L.featureGroup().addTo(map);
    }
    return map;
}

export function initPropertyFormMap(existingGeoJSON) {
    const map = createBaseMap('property-map', {}, [34.7465, -92.2896, 10]);
    if (!map) return;
      
    const drawnItems = new L.FeatureGroup().addTo(map);

    if (existingGeoJSON?.geometry?.coordinates) {
        const existingLayer = L.geoJSON(existingGeoJSON);
        drawnItems.addLayer(existingLayer.getLayers()[0]);
        lastDrawnLayer = drawnItems.getLayers()[0];
        map.fitBounds(existingLayer.getBounds(), { padding: [50, 50] });
        calculateAndDisplayAcreage(lastDrawnLayer);
    }

    const drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems },
        draw: { polygon: { allowIntersection: false, showArea: true }, polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false }
    }).addTo(map);

    map.on(L.Draw.Event.CREATED, (event) => {
        drawnItems.clearLayers();
        lastDrawnLayer = event.layer.addTo(drawnItems);
        calculateAndDisplayAcreage(lastDrawnLayer);
    });
    map.on(L.Draw.Event.EDITED, (event) => {
        lastDrawnLayer = event.layers.getLayers()[0];
        calculateAndDisplayAcreage(lastDrawnLayer);
    });
    map.on(L.Draw.Event.DELETED, () => {
        lastDrawnLayer = null;
        calculateAndDisplayAcreage(null);
    });
}

function calculateAndDisplayAcreage(layer) {
    const acreageSpan = document.getElementById('calculated-acreage');
    if (layer?.getLatLngs && L.GeometryUtil) {
        const latlngs = layer.getLatLngs()[0];
        if (latlngs?.length > 2) {
            const areaInMeters = L.GeometryUtil.geodesicArea(latlngs);
            acreageSpan.textContent = (areaInMeters / 4046.86).toFixed(2);
            return;
        }
    }
    acreageSpan.textContent = '0.00';
}

export function getLastDrawnGeoJSON() {
    if (!lastDrawnLayer) return null;
    return lastDrawnLayer.toGeoJSON();
}

export function getProjectAnnotationsAsGeoJSON() {
    if (saleMapFeatures.length === 0) return null;
      
    const features = saleMapFeatures
        .filter(item => item.type !== 'Property Boundary')
        .map(item => {
            const feature = item.layer.toGeoJSON();
            feature.properties = {
                label: item.label,
                type: item.type,
                color: item.layer.options.color,
                acreage: item.acreage || 0
            };
            return feature;
        });

    return {
        type: "FeatureCollection",
        features: features
    };
}

export function initTimberSaleMap(propertyGeoJSON, existingAnnotations, isReadOnly = false) {
    const map = createBaseMap('timber-sale-map');
    if (!map) return null;

    saleMapFeatures = [];
    const drawnItems = new L.FeatureGroup().addTo(map);

    if (propertyGeoJSON?.geometry?.coordinates) {
        const propertyStyle = { color: '#22c55e', weight: 3, fillOpacity: 0.1, dashArray: '5, 5', clickable: false };
        const propertyLayer = L.geoJSON(propertyGeoJSON, {
            style: propertyStyle
        }).addTo(map);
          
        if (propertyLayer.getBounds().isValid()) {
            map.fitBounds(propertyLayer.getBounds(), { padding: [50, 50] });
            const areaInMeters = L.GeometryUtil.geodesicArea(propertyLayer.getLayers()[0].getLatLngs()[0]);
            const acreage = areaInMeters / 4046.86;
            
            propertyLayer.options.originalStyle = propertyStyle;

            saleMapFeatures.push({ layer: propertyLayer, type: 'Property Boundary', label: 'Property Boundary', acreage: acreage });
        }
    }

    if (existingAnnotations) {
        let parsedAnnotations = existingAnnotations;
        if (typeof parsedAnnotations === 'string') {
            try {
                parsedAnnotations = JSON.parse(parsedAnnotations);
            } catch (e) {
                console.error("Failed to parse annotations JSON:", e);
                parsedAnnotations = null;
            }
        }

        if (parsedAnnotations) {
            L.geoJSON(parsedAnnotations, {
                pointToLayer: (feature, latlng) => {
                    const colorIndex = saleMapFeatures.length % DRAW_FILL_PALETTE.length;
                    const marker = L.circleMarker(latlng, {
                        radius: 8,
                        color: 'white',
                        weight: 2,
                        fillColor: DRAW_BORDER_PALETTE[colorIndex],
                        fillOpacity: 0.9
                    });
                    marker.options.color = DRAW_BORDER_PALETTE[colorIndex];
                    return marker;
                },
                onEachFeature: (feature, layer) => {
                    const { label, type, acreage } = feature.properties;
                    const colorIndex = saleMapFeatures.length % DRAW_FILL_PALETTE.length;
                    const style = {
                        color: DRAW_BORDER_PALETTE[colorIndex],
                        weight: 3,
                        fillColor: DRAW_FILL_PALETTE[colorIndex],
                        fillOpacity: 0.5
                    };
                     
                    if (typeof layer.setStyle === 'function') {
                        layer.setStyle(style);
                    }
                    layer.options.color = style.color; 

                    if (label) {
                       layer.bindTooltip(label);
                    }
                    saleMapFeatures.push({ layer, type, label, acreage });
                    drawnItems.addLayer(layer);
                }
            }).addTo(map);
        }
    }

    if (!isReadOnly) {
        const colorIndex = () => saleMapFeatures.length % DRAW_FILL_PALETTE.length;
        const drawControl = new L.Control.Draw({
            edit: { featureGroup: drawnItems },
            draw: {
                polygon: { shapeOptions: { color: DRAW_BORDER_PALETTE[0], weight: 3, fillColor: DRAW_FILL_PALETTE[0], fillOpacity: 0.5 } },
                rectangle: { shapeOptions: { color: DRAW_BORDER_PALETTE[0], weight: 3, fillColor: DRAW_FILL_PALETTE[0], fillOpacity: 0.5 } },
                polyline: { shapeOptions: { color: DRAW_BORDER_PALETTE[0], weight: 4 } },
                marker: false,
                circlemarker: { 
                    radius: 8,
                    color: 'white',
                    weight: 2,
                    fillColor: DRAW_BORDER_PALETTE[0],
                    fillOpacity: 0.9
                },
                circle: false,
            }
        }).addTo(map);

        map.on(L.Draw.Event.CREATED, (event) => {
            const layer = event.layer;
            const type = event.layerType;
            const idx = colorIndex();
              
            let style = {};
            if (type === 'circlemarker') {
                style = {
                    fillColor: DRAW_BORDER_PALETTE[idx],
                    fillOpacity: 0.9
                };
            } else if (type === 'polyline') {
                style = {
                    color: DRAW_BORDER_PALETTE[idx],
                    weight: 4
                };
            } else {
                style = {
                    color: DRAW_BORDER_PALETTE[idx],
                    weight: 3,
                    fillColor: DRAW_FILL_PALETTE[idx],
                    fillOpacity: 0.5
                };
            }
            layer.setStyle(style);

            let featureType = 'Feature';
            if (type === 'polygon') featureType = 'Harvest Area';
            if (type === 'rectangle') featureType = 'SMZ';
            if (type === 'polyline') featureType = 'Road';
            if (type === 'circlemarker') featureType = 'Point of Interest';

            const label = prompt(`Enter a label for this new ${featureType}:`);
              
            if (label) {
                layer.bindTooltip(label);
                drawnItems.addLayer(layer);
                let acreage = 0;
                if ((featureType === 'Harvest Area' || featureType === 'SMZ') && layer.getLatLngs) {
                    const areaInMeters = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
                    acreage = areaInMeters / 4046.86;
                }
                saleMapFeatures.push({ layer, type: featureType, label, acreage });
                document.dispatchEvent(new CustomEvent('harvestAreasUpdated'));
            }
        });

        map.on(L.Draw.Event.DELETED, (event) => {
            event.layers.eachLayer(layer => {
                saleMapFeatures = saleMapFeatures.filter(item => item.layer !== layer);
            });
            document.dispatchEvent(new CustomEvent('harvestAreasUpdated'));
        });
    }
     
    setTimeout(() => {
        document.dispatchEvent(new CustomEvent('harvestAreasUpdated'));
    }, 200);

    return map;
}

// MODIFIED: This function is now more robust and will not crash on invalid GeoJSON.
export function initDetailViewMap(containerId, geoJSON, annotations) {
    const map = createBaseMap(containerId);
    if (!map) return;
    
    let bounds;
    
    // This try-catch block prevents the page from crashing if the GeoJSON is invalid
    try {
        if (geoJSON && geoJSON.geometry && geoJSON.geometry.coordinates) {
            const layer = L.geoJSON(geoJSON).addTo(map);
            bounds = layer.getBounds();
        }
    } catch (error) {
        console.error("Failed to render GeoJSON on detail map:", error);
    }
    
    try {
        if (annotations) {
            const annotationLayer = L.geoJSON(annotations, {
                onEachFeature: (feature, layer) => {
                    if (feature.properties?.label) {
                        layer.bindTooltip(feature.properties.label, { permanent: true, direction: 'center', className: 'map-label' });
                    }
                    if (feature.properties?.color && typeof layer.setStyle === 'function') {
                        layer.setStyle({ color: feature.properties.color });
                    }
                }
            }).addTo(map);

            if (!bounds || !bounds.isValid()) {
                bounds = annotationLayer.getBounds();
            } else {
                bounds.extend(annotationLayer.getBounds());
            }
        }
    } catch (e) {
        console.error("Could not add annotations to detail map, invalid GeoJSON:", e);
    }

    if (bounds && bounds.isValid()) {
         map.fitBounds(bounds, { padding: [50, 50] });
    }
    setTimeout(() => map.invalidateSize(), 0);
}

export function initProfileDisplayMap(containerId, userProfile) {
     const map = createBaseMap(containerId, { dragging: false, scrollWheelZoom: false, doubleClickZoom: false });
     if (userProfile?.location) {
        const latLng = [userProfile.location.lat, userProfile.location.lng];
        map.setView(latLng, 9);
        L.marker(latLng).addTo(map);
        if (userProfile.serviceRadius) {
            L.circle(latLng, { radius: userProfile.serviceRadius * 1609.34, color: '#007bff', fillOpacity: 0.1 }).addTo(map);
        }
        setTimeout(() => map.invalidateSize(), 0);
     }
}

export function initSignupMap() {
    const mapId = `signup-map`;
    const map = createBaseMap(mapId, {}, [34.7465, -92.2896, 5]);
    if (!map) return;

    locationMarker = null;
    map.on('click', (e) => {
        if (locationMarker) {
            locationMarker.setLatLng(e.latlng);
        } else {
            locationMarker = L.marker(e.latlng).addTo(map);
        }
    });
    setTimeout(() => map.invalidateSize(), 400);
}

export function initEditProfileMap(userProfile) {
    const lat = userProfile?.location?.lat || 34.7465;
    const lng = userProfile?.location?.lng || -92.2896;
    const radius = userProfile?.serviceRadius || 50;
      
    const map = createBaseMap('edit-profile-map', {}, [lat, lng, 7]);
    if (!map) return;
      
    locationMarker = L.marker([lat, lng], { draggable: true }).addTo(map);
    serviceAreaCircle = L.circle([lat, lng], { radius: radius * 1609.34, color: 'blue', fillColor: '#3498db', fillOpacity: 0.2 }).addTo(map);
      
    locationMarker.on('dragend', (event) => serviceAreaCircle.setLatLng(event.target.getLatLng()));
    setTimeout(() => map.invalidateSize(), 400);
}

export function updateServiceAreaCircle(radiusInMiles) {
    if (serviceAreaCircle) {
        serviceAreaCircle.setRadius(radiusInMiles * 1609.34);
    }
}

export function getUpdatedLocation() {
    if (locationMarker) {
        const { lat, lng } = locationMarker.getLatLng();
        return { lat, lng };
    }
    return null;
}