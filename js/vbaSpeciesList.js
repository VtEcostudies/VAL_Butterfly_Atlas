import { getOccsByFilters } from '../VAL_Web_Utilities/js/fetchGbifOccs.js';
import { getWikiPage } from '../VAL_Web_Utilities/js/wikiPageData.js'
import { parseCanonicalFromScientific } from '../VAL_Web_Utilities/js/commonUtilities.js';
import { getSheetVernaculars } from '../VAL_Web_Utilities/js/fetchGoogleSheetsData.js';
import { checklistVernacularNames } from '../VAL_Web_Utilities/js/fetchGbifSpecies.js';
import { fetchInatGbifDatasetInfo, fetchEbutGbifDatasetInfo, datasetKeys, gbifDatasetUrl } from "../VAL_Web_Utilities/js/fetchGbifDataset.js";

const objUrlParams = new URLSearchParams(window.location.search);
const geometry = objUrlParams.get('geometry');
const dataset = objUrlParams.get('dataset');
const block = objUrlParams.get('block');
const taxonKeyA = objUrlParams.getAll('taxonKey');
console.log('Query Param(s) taxonKeys:', taxonKeyA);

const butterflyKeys = 'taxon_key=6953&taxon_key=5473&taxon_key=7017&taxon_key=9417&taxon_key=5481&taxon_key=1933999';
var sheetVernacularNames = getSheetVernaculars();

var other = ''; var objOther = {};
objUrlParams.forEach((val, key) => {
    if ('geometry'!=key && 'block'!=key && 'dataset'!=key) {
      other += `&${key}=${val}`;
      objOther[key] = val;
    }
  });
  
const eleDiv = document.getElementById("speciesListDiv");
const eleTbl = document.getElementById("speciesListTable");
const eleTtl = document.getElementById("speciesListTitle");
const eleInat =  document.getElementById("inatInfoLabel");
const eleEbut =  document.getElementById("ebutInfoLabel");

/*
geometry=POLYGON((-73.0 44.0,-72.75 44.0,-72.75 44.2,-73.0 44.2,-73.0 44.0))
coordinates: Array (1)
  coordinates[0]: Array(5)
    0: Array [ -72.56200954781823, 44.291742756710484 ]
    1: Array [ -72.56205261876526, 44.25007688817722 ]
    2: Array [ -72.62455517288059, 44.2500594469373 ]
    3: Array [ -72.6245558831222, 44.2917251487992 ]
    4: Array [ -72.56200954781823, 44.291742756710484 ]
*/
async function getBlockSpeciesList(block='block_name', dataset=false, gWkt=false, tKeys=false) {

    let occs = await getOccsByFilters(0,300,dataset,gWkt,false,tKeys);
    //console.log('getBlockSpeciesList', occs);
    let hedSpcs = 'Species List for ' + block + (dataset ? ` and dataset ${dataset}` : '')
    let objSpcs = {}; let objGnus = {};
    let arrOccs = occs.results;
    console.log('getBlockSpecieslist', block, arrOccs);
    for (var i=0; i<arrOccs.length; i++) {
        let sciName = parseCanonicalFromScientific(arrOccs[i], 'scientificName');
        let accName = parseCanonicalFromScientific(arrOccs[i], 'acceptedScientificName');
        let canName = parseCanonicalFromScientific(arrOccs[i]);
        let taxRank = arrOccs[i].taxonRank.toUpperCase();
        let taxSpcs = arrOccs[i].species;
        let taxGnus = arrOccs[i].genus;
        /*
            Due to errors in GBIF butterfly taxonomies, we show both the 'Applied' name submitted with the original observation,
            and the 'Accepted' name matched from the GBIF backbone. The values we get from the occurrence API, 'species' and
            'speciesKey', 'genus' and 'genusKey', needed here to show Species List style values from occurrence results, derive
            from the Accepted name.
        */
        if (objSpcs[taxSpcs]) { //check to replace name with more recent observation
            if (arrOccs[i].eventDate > objSpcs[taxSpcs].eventDate) {
                console.log('getOccsByFilters FOUND MORE RECENT OBSERVATION for', sciName, arrOccs[i].eventDate, '>', objSpcs[taxSpcs].eventDate);
                objSpcs[taxSpcs] = {
                    'taxonKey': arrOccs[i].taxonKey, 
                    'acceptedTaxonKey': arrOccs[i].speciesKey, //arrOccs[i].acceptedTaxonKey,
                    'subspKey': 'SUBSPECIES'==taxRank ? arrOccs[i].acceptedTaxonKey : false,
                    'scientificName': sciName, //taxSpcs, //sciName
                    'acceptedName': accName,
                    'taxonRank': 'SPECIES', //taxRank
                    'vernacularName': arrOccs[i].vernacularName, //not used - see fillRow
                    'image': false,
                    'eventDate':  arrOccs[i].eventDate,
                    'gbifId': arrOccs[i].gbifID
                }
            }
        } else { //add new name here only if rank is SPECIES or SUBSPECIES. Deal with GENUS not represented by SPECIES later.
            if ('SPECIES'==taxRank || 'SUBSPECIES'==taxRank) { //...but roll SUBSP into SPECIES...
                objSpcs[taxSpcs] = {
                    'taxonKey': arrOccs[i].taxonKey,
                    'acceptedTaxonKey': arrOccs[i].speciesKey, //arrOccs[i].acceptedTaxonKey,
                    'subspKey': 'SUBSPECIES'==taxRank ? arrOccs[i].acceptedTaxonKey : false,
                    'scientificName': sciName, //taxSpcs, //sciName
                    'acceptedName': accName,
                    'taxonRank': 'SPECIES', //taxRank,
                    'vernacularName': arrOccs[i].vernacularName, //not used - see fillRow
                    'image': false,
                    'eventDate':  arrOccs[i].eventDate,
                    'gbifId': arrOccs[i].gbifID
                };
            objGnus[taxGnus]={'canonicalName':canName, 'taxonRank':taxRank};
            }
        }
    }
    //loop again looking for GENUS not listed yet
    for (var i=0; i<arrOccs.length; i++) {
        let sciName = arrOccs[i].scientificName;
        let accName = parseCanonicalFromScientific(arrOccs[i], 'acceptedScientificName');
        let canName = parseCanonicalFromScientific(arrOccs[i]);
        let taxRank = arrOccs[i].taxonRank.toUpperCase();
        let taxGnus = arrOccs[i].genus;
        if ('GENUS'==taxRank && !objGnus[taxGnus]) {
            objSpcs[taxGnus] = {
                'taxonKey': arrOccs[i].taxonKey,
                'acceptedTaxonKey': arrOccs[i].acceptedTaxonKey,
                'scientificName': taxGnus, //sciName,
                'acceptedName': accName,
                'taxonRank': taxRank,
                'vernacularName': arrOccs[i].vernacularName, //not used - see fillRow
                'image': false,
                'eventDate':  arrOccs[i].eventDate,
                'gbifId': arrOccs[i].gbifID
            }
            objGnus[taxGnus]={'canonicalName':canName, 'taxonRank':taxRank};
        }
    }
    return {
        'head': hedSpcs, 
        'cols': ['Taxon Key','Accepted Key','Applied Name','Accepted Name','Taxon Rank','Common Name','Image','Last Observed'], 
        'array': objSpcs, 
        'query': occs.query
    };
}
var waitRow; var waitObj;

async function addTableWait() {
    waitRow = eleTbl.insertRow(0);
    waitObj = waitRow.insertCell(0);
    waitObj.style = 'text-align: center;';
    waitObj.innerHTML = `<i class="fa fa-spinner fa-spin" style="font-size:60px;"></i>`;
}

async function delTableWait() {
    waitObj.remove();
    waitRow.remove();
}

async function addGBIFLink(geometry, taxonKeys) {
    let eleGBIF = document.getElementById("gbifLink");
    eleGBIF.href = `https://www.gbif.org/occurrence/search?${taxonKeys}&geometry=${geometry}`;
    eleGBIF.target = "_blank";
    eleGBIF.innerText = 'GBIF Occurrences';
}
  
//put one row in the header for column names
async function addTableHead(headCols=['Taxon Key','Scientific Name','Taxon Rank','Common Name','Image','Last Observed']) {
    let objHed = eleTbl.createTHead();
    let hedRow = objHed.insertRow(0);
    let colObj;
    for (var i=0; i<headCols.length; i++) {
        colObj = hedRow.insertCell(i);
        colObj.innerText = headCols[i];
    }
}
  
//Create table row for each array element, then fill row of cells
async function addTaxaFromArr(objArr) {
    //console.log('addTaxaFromArr', objArr);
    let rowIdx=0;
    for (const [spcKey, objSpc] of Object.entries(objArr)) {
        //console.log(objSpc, rowIdx)
        let objRow = await eleTbl.insertRow(rowIdx);
        await fillRow(spcKey, objSpc, objRow, rowIdx++);
    }
  }

//Create cells for each object element
async function fillRow(spcKey, objSpc, objRow, rowIdx) {
    let colIdx = 0;
    for (const [key, val] of Object.entries(objSpc)) {
        let colObj; // = objRow.insertCell(colIdx++);
        //console.log('key:', key);
        switch(key) {
            case 'image':
                colObj = objRow.insertCell(colIdx++);
                colObj.innerHTML = `<i class="fa fa-spinner fa-spin" style="font-size:18px"></i>`;
                let wik = getWikiPage(spcKey);
                colObj.innerHTML = '';
                wik.then(wik => {
                    if (wik.thumbnail) {
                        let iconImg = document.createElement("img");
                        iconImg.src = wik.thumbnail.source;
                        iconImg.alt = spcKey;
                        iconImg.className = "icon-image";
                        iconImg.width = "30"; 
                        iconImg.height = "30";
                        let hrefImg = document.createElement("a");
                        hrefImg.href = wik.originalimage.source;
                        hrefImg.target = "_blank";
                        colObj.appendChild(hrefImg);
                        hrefImg.appendChild(iconImg);
                    }
                })
                break;
            case 'scientificName':
                colObj = objRow.insertCell(colIdx++);
                //colObj.innerHTML = `<a title="Wikipedia: ${spcKey}" href="https://en.wikipedia.org/wiki/${spcKey}">${val}</a>`;
                colObj.innerHTML = `<a title="VAL Species Profile: ${val}" href="https://val.vtecostudies.org/species-profile?taxonName=${val}">${val}</a>`;
                break;
            case 'acceptedName':
                colObj = objRow.insertCell(colIdx++);
                //colObj.innerHTML = `<a title="Wikipedia: ${spcKey}" href="https://en.wikipedia.org/wiki/${spcKey}">${val}</a>`;
                colObj.innerHTML = `<a title="VAL Species Profile: ${val}" href="https://val.vtecostudies.org/species-profile?taxonName=${val}">${val}</a>`;
                break;
            case 'eventDate':
                colObj = objRow.insertCell(colIdx++);
                let date = val ? moment(val).format('YYYY-MM-DD') : 'N/A';
                colObj.innerHTML = colObj.innerHTML = `<a title="Gbif Occurrence Record: ${objSpc.gbifId}" href="https://gbif.org/occurrence/${objSpc.gbifId}">${date}</a>`;
                break;
            case 'vernacularName': //don't use GBIF occurrence value for vernacularName, use VAL checklist or VAL google sheet
                colObj = objRow.insertCell(colIdx++);
                let key = objSpc.acceptedTaxonKey;
                //colObj.innerHTML = val ? val : (checklistVernacularNames[key] ? checklistVernacularNames[key][0].vernacularName : '');
                //colObj.innerHTML = val ? val : (sheetVernacularNames[key] ? sheetVernacularNames[key][0].vernacularName : '');
                colObj.innerHTML = checklistVernacularNames[key] ? checklistVernacularNames[key][0].vernacularName : (sheetVernacularNames[key] ? sheetVernacularNames[key][0].vernacularName : '');
                break;
            case 'taxonKey':
                colObj = objRow.insertCell(colIdx++);
                colObj.innerHTML = `<a title="Gbif Species Profile: ${val}" href="https://gbif.org/species/${val}">${val}</a>`;
                break;
            case 'acceptedTaxonKey':
                colObj = objRow.insertCell(colIdx++);
                colObj.innerHTML = `<a title="Gbif Species Profile: ${val}" href="https://gbif.org/species/${val}">${val}</a>`;
                break;
            case 'taxonRank':
                colObj = objRow.insertCell(colIdx++);
                colObj.innerHTML = val ? val : '';
                if (objSpc.subspKey) {
                    colObj.innerHTML += ` <a title="Gbif Subspecies Profile: ${objSpc.subspKey}" href="https://gbif.org/species/${objSpc.subspKey}">(from Subsp.)</a>`;
                }
                break;
            default:
                //colObj.innerHTML = val ? val : '';
                break;
        }
    }
}

function setTitleText(block, dataset=false, taxonKeys=false, count=0) {
    if (eleTtl) {
        eleTtl.innerHTML = 
        `VT Butterfly Atlas Species List for Survey Block ${block}${dataset ? ' and dataset ' + dataset : ''}: (<u>${count} taxa</u>)`;
    }
}

function setEbutInfo() {
    let ebut = fetchEbutGbifDatasetInfo();
    console.log('setEbutInfo:', ebut);
    if (eleEbut) {
        ebut.then(ebut => {
            eleEbut.innerHTML = `<a href="${gbifDatasetUrl}/${datasetKeys.ebut}">eButterfly-GBIF</a> Updated on <i>${moment.utc(ebut.pubDate).format('YYYY-MM-DD')}</i>`;
        })
    }
}

function setInatInfo() {
    let inat = fetchInatGbifDatasetInfo();
    console.log('setInatInfo:', inat);
    if (eleInat) {
        inat.then(inat => {
            eleInat.innerHTML = `<a href="${gbifDatasetUrl}/${datasetKeys.inat}">iNaturalist-GBIF</a> Updated on <i>${moment.utc(inat.pubDate).format('YYYY-MM-DD')}</i>`;
        })
    }
}

if (block && geometry) {
    let taxonKeys;
    addTableWait();
    //vernaculars = await getVernaculars();
    if (!dataset && (!taxonKeyA.length)) {taxonKeys = butterflyKeys}
    let spcs = await getBlockSpeciesList(block, dataset, geometry, taxonKeys);
    await addGBIFLink(geometry, taxonKeys);
    await addTaxaFromArr(spcs.array);
    await addTableHead(spcs.cols);
    setTitleText(block, dataset, taxonKeys, Object.keys(spcs.array).length);
    delTableWait();
    setEbutInfo();
    setInatInfo();
} else {
    alert(`Must call with at least the query parameters 'block' and 'geometry'. Alternatively pass a dataset (like 'vba1') or one or more eg. 'taxon_key=1234'.`)
}

async function setDataTable() {
/*
    for (var i=0; i<eleTbl.rows.length; i++) {
        console.log(`TABLE ROW ${i} COLUMN COUNT:`, eleTbl.rows[i].cells.length)
    }
*/
    $('#speciesListTable').DataTable();
}

$('#speciesListTable').ready(function () {
    setDataTable()
});