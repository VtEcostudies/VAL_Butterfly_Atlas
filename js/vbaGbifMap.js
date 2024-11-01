/*
- Show VT priority blocks on a map of VT
- Load a json array from static GBIF Occurrence datasets or a geoJson file and populate the map with point occurrence data
- How to pass parameters to a google form: https://support.google.com/a/users/answer/9308781?hl=en
- How to implement geojson-vt with Leaflet: https://stackoverflow.com/questions/41223239/how-to-improve-performance-on-inserting-a-lot-of-features-into-a-map-with-leafle
*/
import { getBlockSpeciesListVT } from './vbaUtils.js';
import { occInfo, getOccsByFilters, getOccsFromFile, getGbifDatasetInfo, gadmGids, butterflyKeys } from '../VAL_Web_Utilities/js/fetchGbifOccs.js';
import { fetchJsonFile, parseCanonicalFromScientific, jsonToCsv, dateNow, timeNow, timeStamp, createHtmlDownloadData } from '../VAL_Web_Utilities/js/commonUtilities.js';
import { getSheetSignups, getSheetVernaculars } from '../VAL_Web_Utilities/js/fetchGoogleSheetsData.js';
import { datasetKeys, getChecklistVernaculars } from '../VAL_Web_Utilities/js/fetchGbifSpecies.js';
import { getWikiPage } from '../VAL_Web_Utilities/js/wikiPageData.js';
import { getLatLngCenter } from './geoPointsToCentroid.js';
import { get, set, del, clear, keys, entries, getMany, setMany, delMany } from 'https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm';

var checklistVernacularNames = await getChecklistVernaculars(datasetKeys["chkVtb1"]);
var sheetVernacularNames = await getSheetVernaculars();

var vtCenter = [43.916944, -72.668056]; //VT geo center, downtown Randolph
var vtAltCtr = [43.858297, -72.446594]; //VT border center for the speciespage view, where px bounds are small and map is zoomed to fit
var vtBottom = [43.0, -72.8];
var zoomLevel = 8;
var zoomCenter = vtCenter;
var cmGroup = {}; //object of layerGroups of different species' markers grouped into layers
var cmCount = {}; //a global counter for cmLayer array-objects across mutiple species
var cmTotal = {}; //a global total for cmLayer counts across species
var cgColor = {}; //object of colors for separate species layers
var cmColors = {0:"#800000",1:"green",2:"blue",3:"yellow",4:"orange",5:"purple",6:"cyan",7:"grey"};
var cmRadius = zoomLevel/2;
var valMap = {};
var basemapLayerControl = false;
var boundaryLayerControl = false;
var groupLayerControl = false;
var stateLayer = false;
var countyLayer = false;
var townLayer = false;
var bioPhysicalLayer = false;
var geoGroup = false; //geoJson boundary group for ZIndex management
var occGroup = false; //geoJson occurrence group
var customLayerPromise = Promise.resolve();
var townLayerPromise = Promise.resolve();
var blockLayer = false;
var townLayer = false;
var baseMapDefault = null;
var abortData = false;
var eleWait = document.getElementById("wait-overlay");
var eleMapLabs = [document.getElementById("mapInfo1"),document.getElementById("mapInfo2"),document.getElementById("mapInfo3")];
var geoJsonData = false;
var bindPopups = false;
var bindToolTips = false;
var iconMarkers = false;
var clusterMarkers = true;
var sheetSignUps = false; //array of survey blocks that have been signed up
var prioritySignupCount = 0; 
var nonPriorSignupCount = 0;
var priorityBlockCount = 0;
var priorityBlockArray = [];
var signupPriorityStyle = {
  color: "green", //border color
  bgColor: "white", //for text display
  weight: 2,
  fillColor: "green",
  fillOpacity: 0.0,
  disabled: true
};
var signupNonPriorStyle = {
  color: "yellow", //border color
  bgColor: "lightgray", // for text display
  priColor: "yellow", //primary border color
  altColor: "blue", //background-contrast border color
  weight: 2,
  fillColor: "yellow",
  fillOpacity: 0.0,
  disabled: true
};
var priorityStyle = {
  color: "red", //border color
  altColor: "red",
  weight: 2,
  fillColor: "red",
  fillOpacity: 0.0
};
var nonPriorStyle = {
  color: "grey", //border color
  weight: 1,
  fillColor: "blue",
  fillOpacity: 0.0
};

//for standalone use
function addMap() {
    valMap = L.map('mapid', {
            zoomControl: false, //start with zoom hidden.  this allows us to add it below, in the location where we want it.
            center: vtAltCtr,
            zoom: 8,
            crs: L.CRS.EPSG3857 //have to do this to conform to USGS maps
        });

    new L.Control.Zoom({ position: 'bottomright' }).addTo(valMap);

    var attribLarge =  'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, ' +
            '<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
            'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>';

    var attribSmall =  '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>, ' +
            '<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
            '© <a href="https://www.mapbox.com/">Mapbox</a>';

    var mapBoxAccessToken = 'pk.eyJ1Ijoiamxvb21pc3ZjZSIsImEiOiJjanB0dzVoZ3YwNjlrNDNwYm9qN3NmNmFpIn0.tyJsp2P7yR2zZV4KIkC16Q';

    var streets = L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/{z}/{x}/{y}?access_token=${mapBoxAccessToken}`, {
        maxZoom: 20,
        attribution: attribSmall,
        id: 'mapbox.streets'
    });
    var satellite = L.tileLayer(`https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${mapBoxAccessToken}`, {
        maxZoom: 20,
        attribution: attribSmall,
        id: 'mapbox.satellite'
    });

    var esriWorld = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        id: 'esri.world ',
        maxZoom: 20,
        attribution: 'Tiles &copy; Esri' // &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
      });

    var esriTopo = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        id: 'esri.topo',
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri' // &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
      });

    var googleSat = L.tileLayer("https://{s}.google.com/vt/lyrs=s,h&hl=tr&x={x}&y={y}&z={z}",
      {
        id: 'google.satellite', //illegal property
        name: 'Google Satellite +', //illegal property
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
        zIndex: 0,
        maxNativeZoom: 20,
        maxZoom: 20
      });
  
    baseMapDefault = googleSat; //for use elsewhere, if necessary
    valMap.addLayer(baseMapDefault); //and start with that one

    if(basemapLayerControl === false) {
        basemapLayerControl = L.control.layers().addTo(valMap);
    }

    basemapLayerControl.addBaseLayer(streets, "Mapbox Streets");
    basemapLayerControl.addBaseLayer(satellite, "Mapbox Satellite");
    basemapLayerControl.addBaseLayer(esriWorld, "ESRI Imagery");
    basemapLayerControl.addBaseLayer(esriTopo, "ESRI Topo Map");
    basemapLayerControl.addBaseLayer(googleSat, "Google Satellite+");

    console.log('done adding basemaps');

    basemapLayerControl.setPosition("bottomright");

    valMap.on("zoomend", e => onZoomEnd(e));
    valMap.on("overlayadd", e => MapOverlayAdd(e));
    valMap.on("baselayerchange", e => MapBaseChange(e));
}

/*
  Fired when an base map layer is selected through a layer control.
*/
function MapBaseChange(e) {
  console.log('MapBaseChange', e.layer.options.id);
  let id = e.layer.options.id;
  if ('esri.topo' == id || 'mapbox.streets' ==  id) {
    signupNonPriorStyle.color = signupNonPriorStyle.altColor;
    eleMapLabs.forEach(ele => {
      ele.classList.remove('bg-contrast');
      })
    } else {
      signupNonPriorStyle.color = signupNonPriorStyle.priColor;
    eleMapLabs.forEach(ele => {
      ele.classList.add('bg-contrast');
      })
    }
  geoGroup.eachLayer(layer => {
    layer.resetStyle();
  })
}

/*
  Fired when an overlay is selected through a layer control. We send all overlays
  to the back so that point markers remain clickable, in the foreground.
*/
function MapOverlayAdd(e) {
  console.log('MapOverlayAdd', e.layer.options.name);
  if (typeof e.layer.bringToBack === 'function') {e.layer.bringToBack();} //push the just-added layer to back
  geoGroup.eachLayer(layer => {
    console.log(`MapOverlayAdd found GeoJson layer:`, layer.options.name);
    if (layer.options.name != e.layer.options.name) {
      layer.bringToBack(); //push other overlays to back
    }
  })
}

function LayerToFront(layerName) {
  console.log('LayerToFront looking for GeoJson layer:', layerName);
  geoGroup.eachLayer(layer => {
    //console.log(`LayerToFront found GeoJson layer:`, layer.options.name);
    if (layer.options.name == layerName) {
      console.log(`LayerToFront found GeoJson layer:`, layer.options.name);
      layer.bringToFront();
    }
  })
}

function setZoomStyle() {
  let z = valMap.getZoom();
  let f = z < 12 ? 4/z : 0;
  let w = z/4;
  priorityStyle.fillOpacity = f;
  signupPriorityStyle.fillOpacity = f;
  signupNonPriorStyle.fillOpacity = f;
  priorityStyle.weight = w;
  signupPriorityStyle.weight = w;
  signupNonPriorStyle.weight = w;
  geoGroup.eachLayer(layer => {
    layer.resetStyle();
  })
}

function onZoomEnd(e) {
  zoomLevel = valMap.getZoom();
  zoomCenter = valMap.getCenter();
  setZoomStyle();
  //SetEachPointRadius();
  setZoomInfo();
}

function setZoomInfo() {
    let eleZum = document.getElementById("zoomInfo");
    if (eleZum) {
      eleZum.innerText = `Zoom: ${zoomLevel}`;
    }
}

async function zoomVT() {
  geoGroup.eachLayer(async layer => {
    if ('State'==layer.options.name) {
      console.log('zoomVT found GeoJson layer', layer.options.name);
      await valMap.fitBounds(layer.getBounds());
    }
  })
}

/*
  Add boundaries to map with their own control.
  layerPath is optional additional layer, eg. surveyBlocks
*/
async function addBoundaries(layerPath=false, layerName=false, layerId=9) {

    if (boundaryLayerControl === false) {
        boundaryLayerControl = L.control.layers().addTo(valMap);
    } else {
        console.log('boundaryLayerControl already added.')
        return;
    }
    boundaryLayerControl.setPosition("bottomright");

    geoGroup = new L.FeatureGroup();

    if (layerPath) {
      customLayerPromise = addGeoJsonLayer(layerPath, layerName, layerId, boundaryLayerControl, geoGroup, true);
    }
    
    addGeoJsonLayer('geojson/Polygon_VT_State_Boundary.geojson', "State", 0, boundaryLayerControl, geoGroup);
    addGeoJsonLayer('geojson/Polygon_VT_County_Boundaries.geojson', "Counties", 1, boundaryLayerControl, geoGroup, !layerPath);
    townLayerPromise = addGeoJsonLayer('geojson/Polygon_VT_Town_Boundaries.geojson', "Towns", 2, boundaryLayerControl, geoGroup);
    addGeoJsonLayer('geojson/Polygon_VT_Biophysical_Regions.geojson', "Biophysical Regions", 3, boundaryLayerControl, geoGroup);

    return {customLayerPromise: customLayerPromise, townLayerPromise: townLayerPromise};
}

async function addGeoJsonLayer(file="test.geojson", layerName="Test", layerId = 0, layerControl=null, layerGroup=null, addToMap=false, featrFunc=onGeoBoundaryFeature, styleFunc=onGeoBoundaryStyle) {
  try {
    let json = await fetchJsonFile(file);
    let layer = await L.geoJSON(json, {
      onEachFeature: featrFunc,
      style: styleFunc,
      name: layerName, //IMPORTANT: this used to compare layers at ZIndex time
      id: layerId
    });
    if (addToMap) {layer.addTo(valMap); layer.bringToBack();}
    if (layerControl) {layerControl.addOverlay(layer, layerName);}
    if (layerGroup) {layerGroup.addLayer(layer);}
    return layer;
  } catch(err) {
    console.log('addGeoJsonLayer ERROR', file, err);
  }
}

function onGeoBoundaryFeature(feature, layer) {
  layer.on('mousemove', function (event) {
    if (feature.properties) {
      var obj = feature.properties;
      var tips = '';
      for (var key in obj) { //iterate over feature properties
        switch(key.toLowerCase()) {
          case 'blockname':
            tips = `Block: ${obj[key]}<br>`;
            let blok = blockLinkFromBlockName(feature.properties.BLOCKNAME);
            if (sheetSignUps[blok]) {
              for (const name of sheetSignUps[blok])
              tips += `${name.first} ${name.last} on ${name.date.split(' ')[0]}<br>`;
            }
            break;
          case 'townname':
            tips = `Town: ${obj[key]}`;
            break;
          case 'cntyname':
            tips = `County: ${obj[key]}`;
            break;
        }
      }
      if (tips) {layer.bindTooltip(tips).openTooltip();}
    }
  });
  layer.on('click', async function (event) {
      //console.log('click | event', event, '| layer', layer);
      //console.log('onGeoBoundaryFeature::layer.onClick | layer.getBounds:', layer.getBounds());
      //console.log('onGeoBoundaryFeature::layer.onClick | feature.properties:', feature.properties);
      //console.log('onGeoBoundaryFeature::layer.onClick | feature.geometry:', feature.geometry);
      valMap.fitBounds(layer.getBounds()); //applies to all layers
      if (9 == layer.options.id) { //VT Butterfly Atlas
        var pops;
        var name = feature.properties.BLOCKNAME;

        var link = blockLinkFromBlockName(feature.properties.BLOCKNAME);
        var maplink = link.replace('southmountain','southmtn'); //all SOUTH MOUNTAIN blockmap names was abbreviated. hack it.
        console.log('Survey Block Layer click | block link name:', link, 'map like name:', maplink);
        if (feature.properties.BLOCK_TYPE=='PRIORITY') {
          pops = `<b><u>BUTTERFLY ATLAS PRIORITY BLOCK</u></b></br></br>`;
        } else {
          pops = `<b><u>BUTTERFLY ATLAS SURVEY BLOCK</u></b></br></br>`;
        }
        let type = feature.geometry.type; //this is MULTIPOLYGON, which I think GBIF can't handle
        let cdts = feature.geometry.coordinates[0][0];
        let gWkt = 'POLYGON((';
        //console.log('feature.geometry.coordinates[0][0]', cdts)
        //console.log('feature', feature);
        //for (var i=0; i<cdts.length; i++) { //GBIF changed their WKT parser to only handle anti-clockwise POLYGON vertices. Reverse order:
        for (var i=cdts.length-1; i>=0; i--) {
            console.log(`vbaGbifMap.js=>onGeoBoundaryFeature=>click(): feat.geom.cdts[0][0][${i}]`, cdts[i]);
          gWkt += `${cdts[i][0]} ${cdts[i][1]},`;
        }
        gWkt = gWkt.slice(0,-1) + '))';
        //console.log('WKT Geometry:', gWkt);
        let crev = cdts.map(cdt => [cdt[1],cdt[0]]); //reverse leaflet lon,lat to lat,lon for centroid math
        let centroid = getLatLngCenter(crev);
        let centrLat = centroid[0];
        let centrLon = centroid[1];
        let mapZoom = 12;
        console.log('CENTROID', centroid);
        if (feature.properties.BLOCK_TYPE=='PRIORITY') {
          pops += `<a target="_blank" href="https://s3.us-west-2.amazonaws.com/val.surveyblocks/${maplink}.pdf">Get <b>BLOCK MAP</b> for ${name}</a></br></br> `;
        }
        //figure out if block has been chosen already
        if (sheetSignUps[link]) {
          let names = sheetSignUps[link];
          //console.log(`sheetSignups for ${link}`, names);
          for (const name of names) {
            pops += `Chosen by <b>${name.first} ${name.last}</b> on ${name.date.split(' ')[0]}</br></br>`;
          }
        }
        pops += `<a target="_blank" href="https://docs.google.com/forms/d/e/1FAIpQLSegdid40-VdB_xtGvHt-WIEWR_TapHnbaxj-LJWObcWrS5ovg/viewform?usp=pp_url&entry.1143709545=${link}"><b>SIGN-UP</b> for ${name}</a></br></br>`;
        pops += `<a target="_blank" href="vba_species_list.html?block=${name}&geometry=${gWkt}&lat=${centrLat}&lon=${centrLon}&zoom=${mapZoom}">Get <b>SPECIES LIST</b> for ${name}</a></br>`;
        if (pops) {layer.bindPopup(pops).openPopup();}
      }
    });
}

/*
  Callback function to set style of added geoJson overlays on the Boundary Layer Control
*/
function onGeoBoundaryStyle(feature) {
  if (feature.properties.BLOCK_TYPE) {
    let style;
    switch(feature.properties.BLOCK_TYPE) {
      case 'PRIORITY':
        style = priorityStyle;
        break;
      case 'NONPRIOR':
        style = nonPriorStyle;
        break;
    }
    //Check the signup array to see if block was chosen
    let blockName = blockLinkFromBlockName(feature.properties.BLOCKNAME);
    let blockType = feature.properties.BLOCK_TYPE;
    if (sheetSignUps[blockName]) {
      if ('PRIORITY' == blockType.toUpperCase()) {
        //console.log(`onGeoBoundaryStyle found PRIORITY block signup for`, blockName);
        style = signupPriorityStyle;
      } else {
        //console.log(`onGeoBoundaryStyle found NON-PRIORITY block signup for`, blockName);
        style = signupNonPriorStyle;
      }
    }
    return style;
  } else {
    if (feature.properties.BIOPHYSRG1) { //biophysical regions
      return {color:"red", weight:1, fillOpacity:0.0, fillColor:"red"};
    } else if (feature.properties.CNTYNAME) { //counties
      return {color:"yellow", weight:1, fillOpacity:0.0, fillColor:"yellow"};
    } else if (feature.properties.TOWNNAME) { //towns
      return {color:"blue", weight:1, fillOpacity:0.0, fillColor:"blue"};
    } else {
      return {color:"black", weight:1, fillOpacity:0.0, fillColor:"black"};
    }
  }
}

/*
  Add geoJson occurrences to map with their own layer control
*/
async function addGeoJsonOccurrences(dataset='test', layerId=0) {
  let grpName = occInfo[dataset].name;
  let idGrpName = grpName.split(' ').join('_');

  if (groupLayerControl === false) {
    console.log('Adding groupLayerControl to map.')
    groupLayerControl = L.control.layers().addTo(valMap);
  } else {
      console.log('groupLayerControl already added.')
  }
  groupLayerControl.setPosition("bottomright");

  occGroup = new L.FeatureGroup();
  
  console.log('addGeoJsonOccurrences adding', dataset, occInfo[dataset].geoJson);

  try {
    let json = await fetchJsonFile(`${occInfo[dataset].geoJson}`);
    let layer = await L.geoJSON(json, {
      pointToLayer: function(feature, latlng) {
        if (iconMarkers) {
          let options = {
            icon: L.divIcon(getClusterIconOptions(occInfo[dataset].icon, false, 12))
          }
          return L.marker(latlng, options);
        } else {
          let options = {
            radius: 5,
            fillColor: occInfo[dataset].color,
            color: 'Black',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.3
          }
          return L.circleMarker(latlng, options);
        };      
      },
      onEachFeature: onEachGeoOccFeature,
      name: occInfo[dataset].name,
      id: layerId
    }).addTo(valMap);
    occGroup.addLayer(layer);
    cmGroup[grpName] = occGroup;
    cmCount[grpName] = json.features.length;
    cmTotal[grpName] = json.features.length;
    groupLayerControl.addOverlay(layer, `<label id="${idGrpName}">${grpName} (${cmCount[grpName]}/${cmTotal[grpName]})</label>`);
  } catch(err) {
    console.log('Error loading file', occInfo[dataset].geoJson, err);
  }
}

/*
  Handle mouse events on geoJson Occurrence layers
*/
function onEachGeoOccFeature(feature, layer) {

  layer.on('click', async function (event) {
    var popup = L.popup({
      maxHeight: 200,
      keepInView: true
      })
      .setContent(await occurrencePopupInfo(feature.properties))
      .setLatLng(L.latLng(feature.properties.decimalLatitude, feature.properties.decimalLongitude))
      .openOn(valMap);
    });

  layer.on('mousemove', function (event) {
    //console.log('onEachGeoOccFeature mousemove', event);
  } );
}

function getIntersectingFeatures(e) {
  var clickBounds = L.latLngBounds(e.latlng, e.latlng);
  var lcnt = 0;
  var fcnt = 0;
  var feat = {};

  var intersectingFeatures = [];
  for (var l in valMap._layers) {
    lcnt++;
    var overlay = valMap._layers[l];
    if (overlay._layers) {
      for (var f in overlay._layers) {
        fcnt++;
        var feature = overlay._layers[f];
        var bounds;
        if (feature.getBounds) {
          bounds = feature.getBounds();
        } else if (feature._latlng) {
          bounds = L.latLngBounds(feature._latlng, feature._latlng);
        } else {;}
        if (bounds && clickBounds.intersects(bounds)) {
          var id = `${feature._leaflet_id}`;
          //console.log(`feature._leaflet_id:`,feature._leaflet_id, feat, feat[id]);
          if (feat[id]) {
              //console.log('skipping', feat);
            } else {
              //console.log(`adding`, feat);
              intersectingFeatures.push(feature);
              feat[id] = true;
            }
        }
      }
    }
  }
  console.log(`getIntersectingFeatures | layers: ${lcnt} | features: ${fcnt} | _leaflet_ids:`, feat);
  console.log('intersectingFeatures:', intersectingFeatures);
  var html = null;
  if (intersectingFeatures.length) {
    // if at least one feature found, show it
    html = `<u>Found ${intersectingFeatures.length} features</u><br/>`;
    intersectingFeatures.forEach((ele,idx,arr) => {
      if (ele.defaultOptions && ele.defaultOptions.name) {
        html += ele.defaultOptions.name + ': ';
      }
      if (ele.feature && ele.feature.properties && ele.feature.properties.BLOCKNAME) {html += ele.feature.properties.BLOCKNAME}
      if (ele.feature && ele.feature.properties && ele.feature.properties.TOWNNAME) {html += ele.feature.properties.TOWNNAME}
      if (ele.feature && ele.feature.properties && ele.feature.properties.CNTYNAME) {html += ele.feature.properties.CNTYNAME}
      if (ele.feature && ele.feature.properties && ele.feature.properties.name) {html += ele.feature.properties.name}
      html += '<br/>';
    })
  }
  return html;
}

/*
  Handle a click on an occurrence marker. This is done to avoid hanging a popup on each point to improve performance.
  There is a performance hit, still, because we have to hang popup data on the marker when it's created.
*/
async function markerOnClick(e) {
  eleWait.style.display = 'block';

  let options = e.target ? e.target.options : e.options;
  let latlng = e.latlng ? e.latlng : e._latlng;

  //console.log('markerOnClick', latlng, options);

  var popup = L.popup({
    maxHeight: 200,
    keepInView: true
    })
    .setContent(await occurrencePopupInfo(options))
    .setLatLng(latlng)
    .openOn(valMap);

    eleWait.style.display = 'none';
}

async function markerMouseOver(e) {
  //console.log('markerMouseOver', e);
  let o = e.target.options;
  let content = `
    <b><u>${o.canonicalName}</u></b><br>
    ${o.recordedBy ? o.recordedBy : 'Unknown'}<br>
    ${moment(o.eventDate).format('YYYY-MM-DD')}<br>
    `;
  e.target.bindTooltip(content).openTooltip();
}

/*
  Respond to a click on a leaflet.cluster group
*/
async function clusterOnClick(e) {
  //console.log('clusterOnClick | target.options:', e.target.options);
  //console.log('clusterOnClick | childMarkerCount:', e.layer.getAllChildMarkers().length);
  //console.log('clusterOnClick | cluster:', e.layer);

  let cluster = e.layer
  let bottomCluster = cluster;

  while (bottomCluster._childClusters.length === 1) {
    bottomCluster = bottomCluster._childClusters[0];
  }

  if (bottomCluster._zoom === this._maxZoom && bottomCluster._childCount === cluster._childCount) {
    // All child markers are contained in a single cluster from this._maxZoom to this cluster.
    //console.log('clusterOnClick | Cluster will Spiderfy');
    if (valMap.getZoom() < 15) {
      //valMap.setView(e.latlng, 15); //valMap.getZoom()+5
    }
  } else {
    //console.log(`clusterOnClick | Cluster will Zoom`);
  }

  if (cluster._group._spiderfied) {
    //console.log('clusterOnClick | Cluster IS Spiderfied. Unspiderfy.');
    cluster.unspiderfy();
  }
}

async function clusterOnSpiderfied(e) {
  //console.log('clusterOnSpiderfied | e:', e);

  let list = `<b><u>${e.markers.length} Occurrences</u></b><br>`;

  e.markers.forEach(async (mark, idx) => {
    //console.log('child marker', idx, mark.options);
    let o = mark.options;
    list += `<a href="https://gbif.org/occurrence/${o.gbifID}">${o.gbifID}</a>: ${o.canonicalName}, ${moment(o.eventDate).format('YYYY-MM-DD')}, ${o.recordedBy ? o.recordedBy : 'Unknown'}<br>`;
    })

  var popup = L.popup({
    maxHeight: 200,
    keepInView: false
    })
    .setContent(list)
    .setLatLng(e.cluster._latlng)
    .openOn(valMap);
}

/*
  Shapes defined by divIcon className can be resized with divIcon iconSize (square, round, ...)
  Shapes defined by custom html/css don't respond to divIcon iconSize (diamond, ...)
*/
function getClusterIconOptions(grpIcon, cluster, sz=30) {
  let html;
  let name;
  let size = L.point(sz, sz);
  switch(grpIcon) {
    case 'square':
      html = `<div class="cluster-count"> ${cluster ? cluster.getChildCount() : ''} </div>`;
      name = `${grpIcon}-shape`;
      break;
    case 'round':
      html = `<div class="cluster-count"> ${cluster ? cluster.getChildCount() : ''} </div>`;
      name = `${grpIcon}-shape`;
      break;
    case 'triangle':
      html = `<div class="triangle-count"> ${cluster ? cluster.getChildCount() : ''} </div>`;
      name = cluster ? 'triangle-shape' : 'triangle-small';
      break;
    case 'diamond':
      html = `
        <div class="${cluster ? 'diamond-shape' : 'diamond-small'}">
          <div class="diamond-count">${cluster ? cluster.getChildCount() : ''}</div>
        </div>`;
      break;
  }
  return {'html':html, 'className':name, 'iconSize':size}
}

/*
  This is refactored for larger datasets:
  - don't hang tooltips on each point
  - don't hang popup on each point
  - externally, reduce dataset size by removing unnecessary columns
  - use leaflet.cluster to manage zoom-level point rendering

  //NOTE: grpIcon colors are handled in styles.css with their shape-definitions. Eg. .fa-square & .square-shape  
*/
//async function addOccsToMap(occJsonArr=[], groupField='datasetKey', grpIcon, grpColor='Red') {
async function addOccsToMap(occJsonArr=[], dataset) {
  let sciName;
  let canName;
  let grpName = occInfo[dataset].name;
  let grpIcon = occInfo[dataset].icon;
  let grpColor = occInfo[dataset].color;
  let idGrpName = grpName.split(' ').join('_');
  cmTotal[grpName] = 0; //cmTotal[groupField] = 0;
  if (!occJsonArr.length) return;
  //for (var i = 0; i < occJsonArr.length; i++) {var occJson = occJsonArr[i]; //synchronous loop
  occJsonArr.forEach(async occJson => { //asynchronous loop
      //let grpName = groupField; //begin by assigning all occs to same group
      //if (occJson[groupField]) {grpName = occJson[groupField];} //if the dataset has groupField, get the value of the json element for this record...
      if (typeof cmCount[grpName] === 'undefined') {cmCount[grpName] = 0;}
      cmTotal[grpName]++;

      sciName = occJson.scientificName;
      canName = parseCanonicalFromScientific(occJson);
      if (canName) {sciName = canName;}

      //filter out records without lat/lon location
      //ToDo: Add these to a common, random lat/lon in VT so they show up on the map?
      if (!occJson.decimalLatitude || !occJson.decimalLongitude) {
        if (typeof cmCount['missing'] === 'undefined') {cmCount['missing'] = 0;}
        cmCount['missing']++;
        let gbifID = occJson.key ? occJson.key : occJson.gbifID;
        //console.log('WARNING: Occurrence Record without Lat/Lon values:', gbifID, 'missing:', cmCount['missing'], 'count:', cmTotal[grpName]);
        //continue;
        return;
      }

      var llLoc = L.latLng(occJson.decimalLatitude, occJson.decimalLongitude);
      cmCount[grpName]++; //count occs having location data

      if (clusterMarkers || iconMarkers) {
        var marker = L.marker(llLoc, {icon: L.divIcon(getClusterIconOptions(grpIcon, false, 12))});
      } else {
        var marker = L.circleMarker(llLoc, {
            fillColor: grpColor, //interior color
            fillOpacity: 0.5, //values from 0 to 1
            color: "black", //border color
            weight: 1, //border thickness
            radius: cmRadius
        })
      }

      if (bindPopups) {
        var popup = L.popup({
            maxHeight: 200,
            keepInView: true,
        }).setContent(await occurrencePopupInfo(occJson));
        marker.bindPopup(popup);
      } else {
        if (occJson.gbifID) marker.options.gbifID = occJson.gbifID;
        if (occJson.scientificName) marker.options.scientificName = occJson.scientificName;
        if (occJson.decimalLatitude) marker.options.decimalLatitude = occJson.decimalLatitude;
        if (occJson.decimalLongitude) marker.options.decimalLongitude = occJson.decimalLongitude;
        if (occJson.eventDate) marker.options.eventDate = occJson.eventDate;
        if (occJson.basisOfRecord) marker.options.basisOfRecord = occJson.basisOfRecord;
        if (occJson.recordedBy) marker.options.recordedBy = occJson.recordedBy;
        if (occJson.datasetName) marker.options.datasetName = occJson.datasetName;
        if (occJson.datasetKey) marker.options.datasetKey = occJson.datasetKey;
        if (occJson.taxonKey) marker.options.taxonKey = occJson.taxonKey;
        marker.options.canonicalName = canName ? canName : occJson.scientificName;
        marker.on('click', markerOnClick);
        marker.on('mouseover', markerMouseOver);
      }
      if (bindToolTips) {
        if (occJson.eventDate) {
          marker.bindTooltip(`${sciName}<br>${moment(occJson.eventDate).format('YYYY-MM-DD')}`);
        } else {
          marker.bindTooltip(`${sciName}<br>No date supplied.`);
        }
      }

      let clusterOptions = {
        //disableClusteringAtZoom: 18, //this disables spiderfy, which is necessary to pull-apart stacked, same-location markers
        //spiderfyOnMaxZoom: false, //Leave enabled! This does exactly what we want, it pulls apart max-zoom clusters into their markers.
        maxClusterRadius: 40,
        iconCreateFunction: function(cluster) {
          return L.divIcon(getClusterIconOptions(grpIcon, cluster));
        }
      };
      //let faIcon = 'round'==grpIcon ? 'circle' : ('triangle'==grpIcon ? 'caret-up fa-2x' : grpIcon);
      //NOTE: grpIcon colors are handled in styles.css with their shape-definitions. Eg. .fa-square & .square-shape  
      let faIcon = 'round'==grpIcon ? 'circle' : ('triangle'==grpIcon ? 'caret-up' : grpIcon);
      let grpHtml = `<div class="layerControlItem" id="${idGrpName}"><i class="fa fa-${faIcon} "></i>${grpName}<span id="groupCount-${idGrpName}">&nbsp(<u><b>${cmCount[grpName]}</u></b>)</span></div>`;
      
      if (typeof cmGroup[grpName] === 'undefined') {
        console.log(`cmGroup[${grpName}] is undefined...adding.`);
        if (clusterMarkers) {
          cmGroup[grpName] = L.markerClusterGroup(clusterOptions).addTo(valMap);
          cmGroup[grpName].on('clusterclick', clusterOnClick);
          cmGroup[grpName].on('spiderfied', clusterOnSpiderfied);
        } else {
          cmGroup[grpName] = L.layerGroup().addTo(valMap); //create a new, empty, single-species layerGroup to be populated with points
        }
        if (groupLayerControl) {
          groupLayerControl.addOverlay(cmGroup[grpName], grpHtml);
        } else {
          groupLayerControl = L.control.layers().addTo(valMap);
          groupLayerControl.setPosition("bottomright");
          groupLayerControl.addOverlay(cmGroup[grpName], grpHtml);
        }
        cmGroup[grpName].addLayer(marker); //add this marker to the current layerGroup, which is an object with possibly multiple layerGroups by sciName
      } else {
        cmGroup[grpName].addLayer(marker); //add this marker to the current layerGroup, which is an object with possibly multiple layerGroups by sciName
      }
    } //end for-loop
    )
  if (document.getElementById("jsonResults")) {
      document.getElementById("jsonResults").innerHTML += ` | records mapped: ${cmCount['all']}`;
  }

  //cmGroup's keys are sciNames or datasets or whatever groupField was requested
  //each layer's control label's id=idGrpName has spaces replaced with underscores
  Object.keys(cmGroup).forEach((grpName) => {
    let idGrp = grpName.split(' ').join('_');
    if (document.getElementById(idGrp)) {
        console.log(`-----match----->> ${idGrp} | ${grpName}`, cmCount[grpName], cmTotal[grpName]);
        document.getElementById(`groupCount-${idGrp}`).innerHTML = `&nbsp(<u><b>${cmCount[grpName]}</b></u>)`;
    }
  });
}

async function occurrencePopupInfo(occRecord) {
    var info = '';

    Object.keys(occRecord).forEach(function(key) {
        switch(key) {
            case 'raw_institutionCode':
                if ('iNaturalist' == occRecord[key]) {
                    info += `<a href="https://www.inaturalist.org/observations/${occRecord.occurrenceID}" target="_blank">iNaturalist Observation ${occRecord.occurrenceID} </a><br/>`;
                } else {
                    info += `Institution: ${occRecord[key]}<br/>`;
                }
                break;
            case 'gbifID':
            case 'key':
                info += `<a href="https://www.gbif.org/occurrence/${occRecord[key]}" target="_blank">GBIF Occurrence ${occRecord[key]}</a><br/>`;
                break;
            case 'decimalLatitude':
                //info += `Lat: ${occRecord[key]}<br/>`;
                break;
            case 'decimalLongitude':
                //info += `Lon: ${occRecord[key]}<br/>`;
                break;
            case 'scientificName':
                info += `Scientific Name: ${occRecord[key]}<br/>`;
                break;
            case 'vernacularName':
              //info += `Common Name: ${occRecord[key]}<br/>`; //don't use GBIF occurrence vernacularName. see below.
              break;
            case 'collector':
              info += `Collector: ${occRecord[key]}<br/>`;
              break;
            case 'recordedBy':
                info += `Recorded By: ${occRecord[key]}<br/>`;
                break;
            case 'basisOfRecord':
                info += `Basis of Record: ${occRecord[key]}<br/>`;
                break;
            case 'eventDate':
                //var msecs = occRecord[key]; //epoch date in milliseconds at time 00:00
                //info += `Event Date: ${getDateMMMMDoYYYY(msecs)}<br/>`; //this for json occurrences (from eg. GBIF API)
                info += `Event Date: ${moment(occRecord[key]).format('YYYY-MM-DD')}<br/>`; //this for geoJson occurrences
                break;
            case 'datasetName':
                info += `Dataset Name: ${occRecord[key]}<br/>`;
                break;
            default: //un-comment this to list all properties
                //info += `${key}: ${occRecord[key]}<br/>`;
            }
        });
        try {
          //1. Don't use vernacularName from GBIF record. Use VAL checklist data or VAL Google sheet vernacularNames
          console.log(`occurrencePopupInfo | Occurrence vernacularName:`, occRecord.vernacularName, '| taxonKey:', occRecord.taxonKey);
          console.log(`occurrencePopupInfo | Butterfly Checklist vernacularNames:`, checklistVernacularNames[occRecord.taxonKey]);
          console.log(`occurrencePopupInfo | Google Sheet vernacularNames:`, sheetVernacularNames[occRecord.taxonKey]);
          if (checklistVernacularNames[occRecord.taxonKey]) {
            info += `Common Name: ${checklistVernacularNames[occRecord.taxonKey] ? checklistVernacularNames[occRecord.taxonKey][0].vernacularName : ''}<br/>`
          } else if (sheetVernacularNames[occRecord.taxonKey]) {
            info += `Common Name: ${sheetVernacularNames[occRecord.taxonKey] ? sheetVernacularNames[occRecord.taxonKey][0].vernacularName : ''}<br/>`
          }
          //2. If no datasetName but yes datasetKey, call GBIF API for datasetName
          if (occRecord.datasetKey && !occRecord.datasetName) {
            let dst = await getGbifDatasetInfo(occRecord.datasetKey);
            info += `Dataset: <a href="https://gbif.org/dataset/${occRecord.datasetKey}">${dst.title}<br/></a>`;
          }
          //3. If no canonicalName parse canonicalName and call Wikipedida API
          console.log(`occurrencePopupInfo | canonicalName:`, occRecord.canonicalName, '| taxonRank:', occRecord.taxonRank);
          let canName = false;
          if (occRecord.canonicalName) {canName = occRecord.canonicalName;}
          else if (occRecord.taxonRank) {canName = parseCanonicalFromScientific(occRecord);}
          if (canName) {
            let wik = await getWikiPage(canName);
            if (wik.thumbnail) {
              info += `<a target="_blank" href="${wik.originalimage.source}"><img src="${wik.thumbnail.source}" width="50" height="50"><br/></a>`;
            }
          }
        } catch(err) {
          console.log(`occurrencePopupInfo::getWikiPage ERROR:`, err);
        }
    return info;
}

//iterate through all plotted pools in each featureGroup and alter each radius
function SetEachPointRadius(radius = cmRadius) {
  cmRadius = Math.floor(zoomLevel/2);

/*
  Object.keys(cmGroup).forEach((name) => {
    cmGroup[name].eachLayer((cmLayer) => {
      if (cmLayer instanceof L.circleMarker) {
        cmLayer.setRadius(radius);
        cmLayer.bringToFront(); //this works, but only when this function is called
      }
    });
  });
*/
}

//standalone module usage
function initGbifStandalone(layerPath=false, layerName, layerId) {
    addMap();
    addMapCallbacks();
    if (!boundaryLayerControl) {addBoundaries(layerPath, layerName, layerId);}
}

/*
  Earlier, this was deprecated in favor of file-scope variable 'sheetSignUps'
  However, now there's an interactive call to refresh those, so we DO use this.
*/
async function getBlockSignups() {
  //get an array of sheetSignUps by blockname with name and date
  sheetSignUps = await getSheetSignups();
  console.log('getBlockSignups', sheetSignUps);
  return sheetSignUps;
}

function putSignups(sign) {
  geoGroup.eachLayer(layer => {
    console.log(`putSignups found GeoJson layer:`, layer.options.name);
    if ('Survey Blocks'==layer.options.name) {
      prioritySignupCount = 0; nonPriorSignupCount = 0; priorityBlockCount = 0; priorityBlockArray = [];
      layer.eachLayer(subLay => {
        let blockName = blockLinkFromBlockName(subLay.feature.properties.BLOCKNAME);
        let blockType = subLay.feature.properties.BLOCK_TYPE;
        if ('PRIORITY' == blockType) {
          priorityBlockArray[blockName] = 1;
          priorityBlockCount++;
        }
        if (sign[blockName]) {
          if ('PRIORITY' == blockType.toUpperCase()) {
            //console.log(`putSignups found PRIORITY block signup for`, blockName);
            subLay.setStyle(signupPriorityStyle);
            prioritySignupCount++;
          } else {
            //console.log(`putSignups found NON-PRIORITY block signup for`, blockName);
            subLay.setStyle(signupNonPriorStyle);
            nonPriorSignupCount++;
          }
        }
      })
    }
  })
}

function listSignups(sign) {
  let sCnt = Object.keys(sign).length;
  let div = document.createElement("div");
  div.innerHTML = `<u><b>${sCnt} TOTAL block sign-ups</b></u><br>`
  div.innerHTML += `<u style="color:${signupPriorityStyle.fillColor};"><b>${prioritySignupCount}/${priorityBlockCount} PRIORITY block sign-ups</b></u><br>`
  div.innerHTML += `<u style="color:${signupNonPriorStyle.fillColor}; background-color:${signupNonPriorStyle.bgColor}"><b>${nonPriorSignupCount} NON-PRIORITY block sign-ups</b></u><br>`

  for (const blok in sign) {
    let style = priorityBlockArray[blok] ? `color:${signupPriorityStyle.fillColor}; background-color:${signupPriorityStyle.bgColor}` : `color:${signupNonPriorStyle.fillColor}; background-color:${signupNonPriorStyle.bgColor}; `;
    let names = sign[blok];
    for (const name of names) {
      let button = document.createElement("button");
      button.style = style;
      button.classList.add("button-as-link"); //remove border; hover background;
      button.style.cursor = "pointer";
      button.innerHTML = `${blok}: ${name.first} ${name.last}`;
      button.setAttribute('blockName', blok);
      button.onclick = (ev) => {
        valMap.closePopup(); //necessary for zoomToblock to work
        zoomToBlock(ev.target.getAttribute('blockName'));
        LayerToFront('Survey Blocks');
      }
      div.appendChild(button);
    }
  }
  zoomVT();
  let popup = L.popup({
    maxHeight: 300,
    minWidth: 250,
    keepInView: true
    })
    .setContent(div)
    .setLatLng(L.latLng(vtBottom))
    .openOn(valMap);
}

if (document.getElementById("valSurveyBlocksVBA")) {
  let layerPath = 'geojson/surveyblocksWGS84_orig.geojson';
  let layerName = 'Survey Blocks';
  let layerId = 9;
  initGbifStandalone(layerPath, layerName, layerId); //on layer load, setStyle checks sheetSignups array for entries and self-styles
  setZoomStyle();
  getBlockSignups() //sets global array sheetSignups
    .then(signUps => {
      putSignups(signUps);
      customLayerPromise.then(() => {fillBlockDropDown().then(()=>{setZoomFromQueryParams();});}) //fill drop-down select list of block names
      townLayerPromise.then(() => {fillTownDropDown().then(()=>{setZoomFromQueryParams();});}) //fill drop-down select list of town names
    })
}

function setZoomFromQueryParams() {
  const objUrlParams = new URLSearchParams(window.location.search);
  const block = objUrlParams.get('block');
  const town =  objUrlParams.get('town');
  if (block) {
    console.log('setZoomFromQueryParams block:', block);
    zoomToBlock(block);
  } else if (town) {
    console.log('setZoomFromQueryParams town:', town);
    zoomToTown(town);
  }
}

async function getLiveData(dataset='vba2', geomWKT=false, gadmGid=false, taxonKeys=false, dateRange=false) {
  let page = {};
  let lim = 300;
  let off = 0;
  let max = 9900;
  do {
    page = await getOccsByFilters(off, lim, dataset, geomWKT, gadmGid, taxonKeys, dateRange);
    addOccsToMap(page.results, dataset);
    off += lim;
  } while (!page.endOfRecords && !abortData && off<max);
}

async function getJsonFileData(dataset='vba1') {
  let occF = await getOccsFromFile(dataset);
  addOccsToMap(occF.rows, dataset);
}

function showUrlInfo(dataset='vba1') {
  if (document.getElementById("urlInfo")) {
    document.getElementById("urlInfo").innerHTML += `<a target="_blank" href="./${occInfo[dataset].file}">${occInfo[dataset].name}</a></br>`;
  }
}

/*
 * Clear any markers from the map
 */
async function clearData() {
  cmCount['all'] = 0;
  //remove all circleMarkers from each group by clearing the layer
  Object.keys(cmGroup).forEach(async (key) => {
      console.log(`Clear layer '${key}'`);
      await cmGroup[key].clearLayers();
      console.log(`Remove control layer for '${key}'`);
      if (groupLayerControl) await groupLayerControl.removeLayer(cmGroup[key]);
      delete cmGroup[key];
      delete cmCount[key];
      delete cmTotal[key];
      delete cgColor[key];
  });
  
  console.log(`Remove group layer control from map`);
  if (groupLayerControl) {valMap.removeControl(groupLayerControl);}
  groupLayerControl = false;
}

async function clearDataSet(dataset=false) {
  if (!dataset) return;

  let key = occInfo[dataset].name;
  await cmGroup[key].clearLayers();
  if (groupLayerControl) await groupLayerControl.removeLayer(cmGroup[key]);
  delete cmGroup[key];
  delete cmCount[key];
  delete cmTotal[key];
  delete cgColor[key];
}

function addMapCallbacks() {
    valMap.on('zoomend', function () {
        console.log(`Map Zoom: ${valMap.getZoom()}`);
    });
    valMap.on('moveend', function() {
        console.log(`Map Center: ${valMap.getCenter()}`);
    });
}
function abortDataLoad() {
  console.log('abortDataLoad request received.');
  abortData = true;
}
if (document.getElementById("zoomVT")) {
  document.getElementById("zoomVT").addEventListener("click", async () => {
    eleWait.style.display = 'block';
    await zoomVT();
    eleWait.style.display = 'none';
  });
}
//dataType
if (document.getElementById("dataType")) {
  let eleType = document.getElementById("dataType");
  geoJsonData = eleType.checked;
  eleType.addEventListener("click", () => {
    geoJsonData = eleType.checked;
    console.log('dataType Click', eleType.checked, geoJsonData);
  });
}
//iconMarkers
if (document.getElementById("iconMarkers")) {
  let eleIcon = document.getElementById("iconMarkers");
  eleIcon.addEventListener("click", () => {
    iconMarkers = eleIcon.checked;
    console.log('dataType Click', eleIcon.checked, iconMarkers);
  });
}
/* An attempt to use the data-load buttons as toggle-buttons to show/hide layers. Abandoned, not necessary. */
async function toggleOccLayer(dataset) {
  let grpName = occInfo[dataset].name;
  console.log('toggleOccLayer', grpName, cmGroup[grpName], cmGroup)
  if (cmGroup.hasLayer(grpName)) {
    eleVtb1.classList.remove('button-active');
    cmGroup.removeLayer(grpName);
  } else {
    eleVtb1.classList.add('button-active');
    cmGroup.addLayer(grpName);
  }
}
/* Add dataset's icon to a button in front of its text using icon definitions in occInfo */
async function addIconToButton(eleButn, dataset) {
  let grpIcon = occInfo[dataset].icon;
  //let faIcon = 'round'==grpIcon ? 'circle' : ('triangle'==grpIcon ? 'caret-up fa-2x' : grpIcon);
  //let faClas = 'triangle'==grpIcon ? 'map-button icon-button triangle-button' : 'map-button icon-button';
  let faIcon = 'round'==grpIcon ? 'circle' : ('triangle'==grpIcon ? 'caret-up' : grpIcon);
  let faClas = 'triangle'==grpIcon ? 'map-button icon-button' : 'map-button icon-button';
  eleButn.innerHTML = `<span class="${faClas}"><i class="fa fa-${faIcon} "></i>${occInfo[dataset].name}</span>`;
}
let eleVtb1 = document.getElementById("getVtb1");
if (eleVtb1) {
  let dataset = 'vtb1';
  addIconToButton(eleVtb1, dataset);
  eleVtb1.addEventListener("click", async () => {
    eleWait.style.display = 'block';
    abortData = false;
    let grpName = occInfo[dataset].name;
    if (cmGroup[grpName]) {
      alert('Dataset already loaded.');
    } else {
      eleVtb1.classList.add('button-active');
      if (geoJsonData) {await addGeoJsonOccurrences(dataset);
      } else {await getJsonFileData(dataset);}
    }
    eleWait.style.display = 'none';
  });
}
let eleVtb2 = document.getElementById("getVtb2");
if (eleVtb2) {
  let dataset = 'vtb2';
  addIconToButton(eleVtb2, dataset);
  eleVtb2.addEventListener("click", async () => {
    eleWait.style.display = 'block';
    abortData = false;
    let grpName = occInfo[dataset].name;
    if (cmGroup[grpName]) {
      alert('Dataset already loaded.');
    } else {
      eleVtb2.classList.add('button-active');
      if (geoJsonData) {await addGeoJsonOccurrences(dataset);
      } else {await getJsonFileData(dataset);}
    }
    eleWait.style.display = 'none';
  });
}
let eleVba1 = document.getElementById("getVba1");
if (eleVba1) {
  let dataset = 'vba1';
  addIconToButton(eleVba1, dataset);
  eleVba1.addEventListener("click", async () => {
    eleWait.style.display = 'block';
    abortData = false;
    let grpName = occInfo[dataset].name;
    if (cmGroup[grpName]) {
      alert('Dataset already loaded.');
    } else {
      eleVba1.classList.add('button-active');
      if (geoJsonData) {await addGeoJsonOccurrences(dataset);
      } else {await getJsonFileData(dataset);}
    }
    eleWait.style.display = 'none';
  });
}
let eleVba2 = document.getElementById("getVba2");
if (eleVba2) {
  let dataset = 'vba2';
  addIconToButton(eleVba2, dataset);
  eleVba2.addEventListener("click", async () => {
    eleWait.style.display = 'block';
    abortData = false;
    let grpName = occInfo[dataset].name;
    let load = true;
    if (cmGroup[grpName]) {
      load = confirm('Dataset already loaded. Reload?');
      if (load) {await clearDataSet('vba2');}
    }
    if (load) {
      eleVba2.classList.add('button-active');
      if (geoJsonData) {await addGeoJsonOccurrences(dataset);
      } else {await getLiveData('vba2', false, gadmGids.vt, butterflyKeys, '2023,2028');}
    }
    eleWait.style.display = 'none';
  });
}
let eleTest = document.getElementById("getTest");
if (eleTest) {
  let dataset = 'test';
  addIconToButton(eleTest, dataset);
  eleTest.addEventListener("click", async () => {
    eleWait.style.display = 'block';
    abortData = false;
    if (geoJsonData) {await addGeoJsonOccurrences(dataset);
    } else {await getJsonFileData(dataset);}
    eleWait.style.display = 'none';
  });
}
if (document.getElementById("clearData")) {
  document.getElementById("clearData").addEventListener("click", async () => {
    eleWait.style.display = 'block';
    abortData = false;
    await clearData();
    eleWait.style.display = 'none';
  });
}
if (document.getElementById("abortData")) {
  document.getElementById("abortData").addEventListener("click", () => {
      abortData = true;
  });
}
if (document.getElementById("getSign")) {
  document.getElementById("getSign").addEventListener("click", async () => {
    eleWait.style.display = 'block';
    sheetSignUps = await getBlockSignups();
    eleWait.style.display = 'none';
    putSignups(sheetSignUps); //mark survey blocks as taken
    listSignups(sheetSignUps); //popup list of signups
  });
}
if (document.getElementById("getRank")) {
  document.getElementById("getRank").addEventListener("click", async () => {
    get('blockRank_'+dateNow()).then(ranks => {
      console.log(`getRank.click=>get(blockRank_${dateNow()}):`, ranks);
      if (ranks && ranks.length) {
        blockRank = ranks;
        listBlockSpeciesRank(ranks, eleBot?eleBot.value:40, eleTop?eleTop.value:117);
        alert(`Blocks already ranked for today's date: ${dateNow()}.`);
      } else {
        eleWait.style.display = 'block';
        getBlockSpeciesRank(false).then(bRank => {
          listBlockSpeciesRank(bRank, eleBot?eleBot.value:40, eleTop?eleTop.value:117);
          eleWait.style.display = 'none';
        })
      } 
    })
});
}
if (document.getElementById("dldRank")) {
  document.getElementById("dldRank").addEventListener("click", async () => {
    downloadBlockRank();
  });
}
let eleBot = document.getElementById("bot-count");
if (eleBot) {
  eleBot.addEventListener("change", async () => {
    listBlockSpeciesRank(blockRank, eleBot?eleBot.value:40, eleTop?eleTop.value:117);
  });
}
let eleTop = document.getElementById("top-count");
if (eleTop) {
  eleTop.addEventListener("change", async () => {
    listBlockSpeciesRank(blockRank, eleBot?eleBot.value:40, eleTop?eleTop.value:117);
  });
}
let eleData = document.getElementById("rank-wrap");
if (eleData) {
  eleData.addEventListener("wheel", async (e) => {
    console.log("wheel");
    e.stopImmediatePropagation();
  });
}
$('#rank-wrap').on('click dblclick', function(e) {
  e.stopImmediatePropagation();
});

function blockLinkFromBlockName(name) {
  let link = name.replace(/( - )|\s+/g,'').toLowerCase();
  return link;
}
async function fillBlockDropDown() {
  console.log(`fillBlockDropDown`);
  let sel = document.getElementById('blocks');
  if (sel) {
    console.log(`fillBlockDropDown=>select`, sel, 'geoGroup:', geoGroup);
    geoGroup.eachLayer(async layer => {
      console.log(`fillBlockDropDown found GeoJson layer:`, layer.options.name);
      if ('Survey Blocks'==layer.options.name) {
        blockLayer = layer; //set global for use later
        let blox = [];
        layer.eachLayer(blok => {
          let link = blockLinkFromBlockName(blok.feature.properties.BLOCKNAME);
          let obj = {
            name: blok.feature.properties.BLOCKNAME,
            type: blok.feature.properties.BLOCK_TYPE,
            link: link,
            adopted: sheetSignUps[link] ? true : false
          };
          //console.log(blok, link, sheetSignUps[link])
          blox.push(obj);
        })
        blox.sort((a, b) => {return a.name > b.name ? 1 : -1;}); //Chrome can't handle simple a > b. Must return [1, 0, -1]
        blox.forEach(blok => {
          let opt = document.createElement('option');
          opt.innerHTML = blok.name;
          opt.value = blok.name;
          if ('PRIORITY' == blok.type) {
            //opt.style.fontWeight = 'bold'; opt.style.textDecorationLine = 'underline';
            if (blok.adopted) {
              opt.style.backgroundColor = '#33FF66'; //'lightgreen';
            } else {
              opt.style.backgroundColor = 'salmon'; //'lightcoral'; 
            }
          } else if (blok.adopted) {
            opt.style.backgroundColor = '#FFFF66'; //'yellow';
          }
          sel.appendChild(opt);
        })
      }
    })
    sel.addEventListener('change', (ev) => {
      console.log(`blockDropDown=>eventListener('change')=>value:`, ev.target.value);
      zoomToBlock(ev.target.value);
      sel.value = 'default'; //always reset value to disabled postion zero, 'Survey Blocks...'
      LayerToFront('Survey Blocks');
    });
  } else {
    console.log(`fillBlockDropDown => NOT FOUND: drop-down select element id 'blocks'`);
  }
}
function zoomToBlock(blockName) {
  if (blockName && blockLayer) {
    console.log('zoomToBlock', blockName);
    blockLayer.eachLayer(layer => {
      let layerName = layer.feature.properties.BLOCKNAME;
      let layerLink = blockLinkFromBlockName(layer.feature.properties.BLOCKNAME);
      if (blockName == layerName || blockName == layerLink) {
        valMap.fitBounds(layer.getBounds()); //applies to all layers
      }
    })
  } else {
    console.log('blockName or blockLayer not defined', blockName, blockLayer);
  }
}
async function fillTownDropDown() {
  console.log(`fillTownDropDown`);
  let sel = document.getElementById('towns');
  if (sel) {
    console.log(`fillTownDropDown=>select`, sel, 'geoGroup:', geoGroup);
    geoGroup.eachLayer(async layer => {
      console.log(`fillTownDropDown found GeoJson layer:`, layer.options.name);
      if ('Towns'==layer.options.name) {
        townLayer = layer; //set global for use later
        let towns = [];
        layer.eachLayer(town => {
          let obj = {
            name: town.feature.properties.TOWNNAME,
          };
          towns.push(obj);
        })
        towns.sort((a, b) => {return a.name > b.name ? 1 : -1;}); //Chrome can't handle simple a > b. Must return [1, 0, -1]
        towns.forEach(town => {
          let opt = document.createElement('option');
          opt.innerHTML = town.name;
          opt.value = town.name;
          sel.appendChild(opt);
        })
      }
    })
    sel.addEventListener('change', (ev) => {
      console.log(`blockDropDown=>eventListener('change')=>value:`, ev.target.value);
      zoomToTown(ev.target.value);
      sel.value = 'default'; //always reset value to disabled postion zero, 'Towns...'
      LayerToFront('Towns');
    });
  } else {
    console.log(`fillTownDropDown => NOT FOUND: drop-down select element id 'towns'`);
  }
}
function zoomToTown(townName) {
  if (townName && townLayer) {
    console.log('zoomTotown', townName);
    townLayer.eachLayer(layer => {
      let layerName = layer.feature.properties.TOWNNAME;
      if (townName == layerName) {
        valMap.fitBounds(layer.getBounds()); //applies to all layers
      }
    })
  } else {
    console.log('townName or townLayer not defined', townName, townLayer);
  }
}

let blockRank = [];
let showRanks = [];
//Find the 'Survey Blocks' geoJson layer, iterate over its blocks, build a blockRank array
async function getBlockSpeciesRank(type='PRIORITY', limit=0) {
  return new Promise((resolve, reject) => {
    try {
      geoGroup.eachLayer(async layer => {
        if ('Survey Blocks'==layer.options.name) {
          let arrLayer = layer.getLayers();
          console.log('eachLayer', arrLayer, arrLayer.length);
          let i = 0; let exit = 0;
          blockRank = [];
          layer.eachLayer(async subLay => {
            let blockType = subLay.feature.properties.BLOCK_TYPE;
            let blockName = subLay.feature.properties.BLOCKNAME;
            if ((!type || type == blockType) && (!limit || i<limit) && !exit) {
              let blockLink = blockLinkFromBlockName(blockName);
              let blockGeom = await getFeatureGeom(subLay.feature);
              let blockList = await getBlockSpeciesListVT(false, blockGeom.wkt, butterflyKeys, '2023,2027');
              let blockData = {name:blockName,link:blockLink,type:blockType,wkt:blockGeom.wkt,centroid:blockGeom.centroid,spcCount:blockList.spcCount};
              if (!blockRank[blockList.spcCount]) {blockRank[blockList.spcCount] = {};}
              blockRank[blockList.spcCount][blockLink]=blockData;
              
              let blockOwnr = '';
              if (sheetSignUps[blockLink]) {
                for (const name of sheetSignUps[blockLink])
                blockOwnr += `${name.first} ${name.last} on ${name.date.split(' ')[0]}|`;
              }
              //to use this for download CSV, we must create an array of objects without setting a key for each object
              showRanks.push({name:blockName,link:blockLink,type:blockType,spcCount:blockList.spcCount,adoptedBy:blockOwnr});
            }
            i++;
            if ((i>=arrLayer.length || (limit && i>=limit)) && !exit) {
              console.log('getBlockSpeciesRank Exit Value:', i);
              exit = 1;
              set('showRanks_'+dateNow(), showRanks);
              set('blockRank_'+dateNow(), blockRank);
              resolve(blockRank);
            }
          })
        }
      })
    } catch(err) {
      exit = 1;
      reject(err);
    }
  })
}
function listBlockSpeciesRank(ranks, bot=40, top=113) {
  let tbl = document.getElementById("rank-data");
  tbl.innerHTML = '';
  let rowCount = 0;
  if (ranks && ranks.length) {
    ranks.filter((rnk,idx) => idx >= bot && idx <= top)
      //.slice().reverse() //if we use a table, insertRow(0) reverses the order.
      .forEach((val,idx) => {
        //console.log('listBlockSpeciesRank 1D:', val, idx, typeof val);
        Object.keys(val).forEach((nam,jdx) => {
          //console.log(`${idx} listBlockSpeciesRank 2D:`, nam, jdx, val[nam]);
          let obj = val[nam];
          addBlockSpeciesRank(obj);
        })
      })
    } else {
      //alert(`No blocks found having VBA2 Atlas species counts between ${bot} and ${top}.`)
      let msg = `No block species data found. 'Rank Blocks' loads the data.`;
      console.log(msg);
      putRankMessage(msg);
    }
}
function putRankMessage(msg) {
  let tbl = document.getElementById("rank-data");
  let row = tbl.insertRow(0);
  let txt = row.insertCell(0);
  txt.innerHTML = msg;
}
function addBlockSpeciesRank(obj) {
  let tbl = document.getElementById("rank-data");
  let row = tbl.insertRow(0);
  let bt1 = row.insertCell(0);
  let cell2 = row.insertCell(1);
  cell2.innerHTML = `<a href="vba_species_list.html?block=${obj.name}&geometry=${obj.wkt}&year=2023,2027&lat=${obj.centroid[0]}&lon=${obj.centroid[1]}&zoom=12">${obj.spcCount}</a>`
  bt1.classList.add("button-as-link"); //remove border; hover background;
  bt1.style.cursor = "pointer";
  bt1.innerHTML = `${obj.link}`;//: ${obj.spcCount}`;
  bt1.setAttribute('blockName', obj.link);
  bt1.onclick = (ev) => {
    valMap.closePopup(); //necessary for zoomToblock to work
    zoomToBlock(ev.target.getAttribute('blockName'));
    LayerToFront('Survey Blocks');
  }
}
async function downloadBlockRank(type=0) {
  let ranks = await get('showRanks_'+dateNow());
  if (!ranks || !Object.keys(ranks).length) {
    console.log('showRanks Array is empty'); 
    return alert("Please run 'Rank Blocks' and let it finish before downloading block ranks.");
  }
  //if (type) { //json-download
    console.log('JSON Download:', ranks);
    var jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(ranks));
    createHtmlDownloadData(jsonStr, `${dateNow()}_vba2_block_rank.json`);
  //} else { //csv-download
    var data = jsonToCsv(ranks);
    console.log('downloadBockRank CSV download:', data);
    var csvStr = "data:text/csv;charset=utf-8," + encodeURIComponent(data);
    createHtmlDownloadData(csvStr, `${dateNow()}_vba2_block_rank.csv`);
  //}
}

async function getFeatureGeom(feature) {
  let cdts = feature.geometry.coordinates[0][0];
  let gWkt = 'POLYGON((';
  //console.log('feature.geometry.coordinates[0][0]', cdts)
  //console.log('feature', feature);
  //for (var i=0; i<cdts.length; i++) { //GBIF changed their WKT parser to only handle anti-clockwise POLYGON vertices. Reverse order:
  for (var i=cdts.length-1; i>=0; i--) {
      console.log(`vbaGbifMap.js=>onGeoBoundaryFeature=>click(): feat.geom.cdts[0][0][${i}]`, cdts[i]);
    gWkt += `${cdts[i][0]} ${cdts[i][1]},`;
  }
  gWkt = gWkt.slice(0,-1) + '))';
  //console.log('WKT Geometry:', gWkt);
  let crev = cdts.map(cdt => [cdt[1],cdt[0]]); //reverse leaflet lon,lat to lat,lon for centroid math
  let centroid = getLatLngCenter(crev);
  return {
    wkt: gWkt,
    centroid: centroid
  }
}
