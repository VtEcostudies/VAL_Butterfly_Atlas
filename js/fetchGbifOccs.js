import { fetchJsonFile } from "./commonUtilities.js";

let gbifApi = "https://api.gbif.org/v1";
let datasetKeys = {"vba1":"0901cecf-55f1-447e-8537-1f7b63a865a0"};
let butterflies = "taxon_key=6953&taxon_key=5473&taxon_key=7017&taxon_key=9417&taxon_key=5481&taxon_key=1933999";
export var icons = {
    round: L.divIcon({className: 'round'}),
    square: L.divIcon({className: 'square'}),
    diamond: L.divIcon({className: 'diamond'}),
    triangle: L.divIcon({className: 'triangle'})
};
export const occInfo = {
    'vtb1':{geoJson:'geojson/vtb1_occs_1000-2001.geojson','json':'occjson/vtb1_occs_1000-2001.json','description':'Obs 1000-2001','icon':icons.square,'color':'Red'},
    'vtb2':{geoJson:'geojson/vtb2_occs_2008-2022.geojson','json':'occjson/vtb2_occs_2008-2022.json','description':'Obs 2008-2022','icon':icons.round,'color':'Blue'},
    'vba1':{geoJson:'geojson/vba1_occs_2002-2007.geojson','json':'occjson/vba1_occs_2002-2007.json','description':'Butterfly Atlas 1','icon':icons.triangle,'color':'Cyan'},
    'vba2':{geoJson:'geojson/vba2_occs_2023-2028.geojson','json':'occjson/vba2_occs_2023-2028.json','description':'Butterfly Atlas 2','icon':icons.diamond,'color':'Green'},
    'test':{geoJson:'geojson/test.geojson','json':'occjson/test.json','description':'test dataset','icon':icons.square,'color':'Red','data':false}
};
export var occData = {
    'vtb1':{},
    'vtb2':{},
    'vba1':{},
    'vba2':{}
}
export async function getOccsByDatasetAndWKT(dataset='vba1', geoWKT='') {
    return await getOccsByFilters(0, 300, datasetKeys[dataset], geoWKT);
}
export async function getOccsByTaxonKeysAndWKT(taxonKeys=false, geoWKT=false) {
    return await getOccsByFilters(0, 300, false, geoWKT, false, taxonKeys);
}
/*
https://api.gbif.org/v1/occurrence/search
    ?datasetKey=0901cecf-55f1-447e-8537-1f7b63a865a0
    &geometry=POLYGON((-73.0%2044.0,%20-72.75%2044.0,%20-72.75%2044.2,%20-73.0%2044.2,%20-73.0%2044.0))
*/
export async function getOccsByFilters(offset=0, limit=300, datasetKey=false, geometryWKT=false, gadmGid=false, taxonKeys=false) {
let reqHost = gbifApi;
let reqRoute = "/occurrence/search?advanced=1";
let reqData = datasetKey ? `&datasetKey=${datasetKey}` : '';
let reqGeom = geometryWKT ? `&geometry=${geometryWKT}` : '';
let reqGadm = gadmGid ? `&gadmGid=${gadmGid}` : '';
let reqTaxa = taxonKeys ? `&${taxonKeys}` : '';
let reqLimits = `&offset=${offset}&limit=${limit}`;
let url = reqHost+reqRoute+reqData+reqGeom+reqGadm+reqTaxa+reqLimits;
let enc = encodeURI(url);

console.log(`getOccsByFilters(${offset}, ${limit}, ${datasetKey}, ${geometryWKT}, ${gadmGid}) QUERY:`, enc);

    try {
        let res = await fetch(enc);
        //console.log(`getOccsByFilters(${offset}, ${limit}, ${datasetKey}, ${geometryWKT}, ${gadmGid}) RAW RESULT:`, res);
        let json = await res.json();
        //console.log(`getOccsByFilters(${offset}, ${limit}, ${datasetKey}, ${geometryWKT}, ${gadmGid}) JSON RESULT:`, json);
        json.query = enc;
        return json;
    } catch (err) {
        err.query = enc;
        console.log(`getOccsByFilters(${offset}, ${limit}, ${datasetKey}, ${geometryWKT}, ${gadmGid}) ERROR:`, err);
        return new Error(err)
    }
}

export async function getOccsFromFile(dataset='vba1') {
    let parr = window.location.pathname.split('/'); delete parr[parr.length-1];
    let path = parr.join('/');
    console.log(`getOccsFromFile:`, `${window.location.protocol}//${window.location.host}/${path}${occInfo[dataset].json}`);
    //console.log(`getOccsFromFile | occData(${dataset}):`, occData[dataset]);
    if (occData[dataset].rowCount) {
        console.log(`getOccsFromFile: FOUND ${occData[dataset].rowCount} rows for ${dataset}.`);
        return occData[dataset];
    }
    else {
        console.log(`getOccsFromFile: No data for ${dataset}. Fetching...`);
        occData[dataset] = await fetchJsonFile(occInfo[dataset].json);
        return occData[dataset];
    }
}

//pre-load local files at file scope to improve map performance?
//NO. Don't do this. It slows initial page load for other pages.
//getOccsFromFile('vtb1');
//getOccsFromFile('vtb2');
//getOccsFromFile('vba1');

/*
https://www.gbif.org/occurrence/search
?taxon_key=6953&taxon_key=5473&taxon_key=7017&taxon_key=9417&taxon_key=5481&taxon_key=1933999
&gadm_gid=USA.46_1
&year=2008,2022

https://www.gbif.org/occurrence/search
?taxon_key=6953&taxon_key=5473&taxon_key=7017&taxon_key=9417&taxon_key=5481&taxon_key=1933999
&state_province=Vermont&has_coordinate=false
&year=2008,2022

https://www.gbif.org/occurrence/search
?taxon_key=6953&taxon_key=5473&taxon_key=7017&taxon_key=9417&taxon_key=5481&taxon_key=1933999
&gadm_gid=USA.46_1
&year=1000,2002

https://www.gbif.org/occurrence/search
?taxon_key=6953&taxon_key=5473&taxon_key=7017&taxon_key=9417&taxon_key=5481&taxon_key=1933999
&state_province=Vermont&has_coordinate=false
&year=1000,2002
*/

/*
    https://api.gbif.org/v1/dataset/df2a8206-84e9-4530-8a0d-b60f687dba0b
*/
export async function getGbifDatasetInfo(datasetKey) {
    let reqHost = gbifApi;
    let reqRoute = `/dataset/${datasetKey}`;
    let url = reqHost+reqRoute;
    let enc = encodeURI(url);
    try {
        let res = await fetch(enc);
        //console.log(`getGbifDatasetInfo(${datasetKey}) RAW RESULT:`, res);
        let json = await res.json();
        //console.log(`getGbifDatasetInfo(${datasetKey}) JSON RESULT:`, json);
        json.query = enc;
        return json;
    } catch (err) {
        err.query = enc;
        console.log(`getGbifDatasetInfo(${datasetKey}) ERROR:`, err);
        return new Error(err)
    }
}
