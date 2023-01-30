import { fetchJsonFile } from "./commonUtilities.js";

let gbifApi = "https://api.gbif.org/v1";
let datasetKeys = {"chkVtb1":"73eb16f0-4b06-4347-8069-459bc2d96ddb"};
export var checklistVtButterflies;
export var checklistVernacularNames;

/*
    https://api.gbif.org/v1/species/search?dataset_key=73eb16f0-4b06-4347-8069-459bc2d96ddb&limit=300
*/

export async function getGbifSpeciesDataset(datasetKey=datasetKeys['chkVtb1'], offset=0, limit=1000) {
    let reqHost = gbifApi;
    let reqRoute = `/species/search?dataset_key=${datasetKey}`;
    let reqLimit = `&offset=${offset}&limit=${limit}`
    let url = reqHost+reqRoute+reqLimit;
    let enc = encodeURI(url);
    try {
        let res = await fetch(enc);
        //console.log(`getGbifSpeciesDataset(${datasetKey}) RAW RESULT:`, res);
        let json = await res.json();
        //console.log(`getGbifSpeciesDataset(${datasetKey}) JSON RESULT:`, json);
        json.query = enc;
        return json;
    } catch (err) {
        err.query = enc;
        console.log(`getGbifSpeciesDataset(${datasetKey}) ERROR:`, err);
        return new Error(err)
    }
}

/*
    Convert GBIF checklist API json.results to object keyed by taxonId having array of vernacularNames.
*/

async function checklistToVernaculars(list=[]) {
    //console.log(`checklistToVernaculars incoming list:`, list);
    let vern = {};
    list.forEach(spc => {
        if (spc.vernacularNames.length) {
            let key = spc.nubKey ? spc.nubKey : spc.key;
            vern[key] = spc.vernacularNames;
        }
    })
    //console.log(`checklistToVernaculars outgoing list:`, vern);
    return vern;
}

checklistVtButterflies = await getGbifSpeciesDataset(); //load file-scope dataset
checklistVernacularNames = await checklistToVernaculars(checklistVtButterflies.results); //fill file-scope vernacalar list object

