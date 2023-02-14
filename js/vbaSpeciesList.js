import { getOccsByFilters } from './fetchGbifOccs.js';
import { getWikiPage } from './wiki_page_data.js'
import { parseCanonicalFromScientific } from './commonUtilities.js';
import { sheetVernacularNames } from './fetchGoogleSheetsData.js';
import { checklistVernacularNames } from './fetchGbifSpecies.js';

const objUrlParams = new URLSearchParams(window.location.search);
const geometry = objUrlParams.get('geometry');
const dataset = objUrlParams.get('dataset');
const block = objUrlParams.get('block');
const taxonKeyA = objUrlParams.getAll('taxonKey');
const butterflyKeys = 'taxon_key=6953&taxon_key=5473&taxon_key=7017&taxon_key=9417&taxon_key=5481&taxon_key=1933999';
//var vernaculars = [];
console.log('Query Param(s) taxonKeys:', taxonKeyA);

const other = ''; var objOther = {};
objUrlParams.forEach((val, key) => {
    if ('geometry'!=key && 'block'!=key && 'dataset'!=key) {
      other += `&${key}=${val}`;
      objOther[key] = val;
    }
  });
  
const eleDiv = document.getElementById("speciesListDiv");
const eleTbl = document.getElementById("speciesListTable");
const eleLbl = document.getElementById("speciesListLabel");

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
    for (var i=0; i<arrOccs.length; i++) {
        let sciName = arrOccs[i].scientificName;
        let canName = parseCanonicalFromScientific(arrOccs[i]);
        let taxRank = arrOccs[i].taxonRank.toUpperCase();
        let taxSpcs = arrOccs[i].species;
        let taxGnus = arrOccs[i].genus;
        if (objSpcs[taxSpcs]) { //check to replace name with more recent observation
            if (arrOccs[i].eventDate > objSpcs[taxSpcs].eventDate) {
                console.log('getOccsByFilters FOUND MORE RECENT OBSERVATION for', sciName, arrOccs[i].eventDate, '>', objSpcs[taxSpcs].eventDate);
                objSpcs[taxSpcs] = {
                    'acceptedTaxonKey': arrOccs[i].speciesKey, //arrOccs[i].acceptedTaxonKey,
                    'subspKey': 'SUBSPECIES'==taxRank ? arrOccs[i].acceptedTaxonKey : false,
                    'scientificName': taxSpcs, //sciName
                    'taxonRank': 'SPECIES', //taxRank
                    'vernacularName': arrOccs[i].vernacularName, //not used - see fillRow
                    'image': false,
                    'eventDate':  arrOccs[i].eventDate
                }
            }
        } else { //add new name here only if rank is SPECIES or SUBSPECIES. Deal with GENUS not represented by SPECIES later.
            if ('SPECIES'==taxRank || 'SUBSPECIES'==taxRank) { //...but roll SUBSP into SPECIES...
                objSpcs[taxSpcs] = {
                    'acceptedTaxonKey': arrOccs[i].speciesKey, //arrOccs[i].acceptedTaxonKey,
                    'subspKey': 'SUBSPECIES'==taxRank ? arrOccs[i].acceptedTaxonKey : false,
                    'scientificName': taxSpcs, //sciName
                    'taxonRank': 'SPECIES', //taxRank,
                    'vernacularName': arrOccs[i].vernacularName, //not used - see fillRow
                    'image': false,
                    'eventDate':  arrOccs[i].eventDate
            };
            objGnus[taxGnus]={'canonicalName':canName, 'taxonRank':taxRank};
            }
        }
    }
    //loop again looking for GENUS not listed yet
    for (var i=0; i<arrOccs.length; i++) {
        let sciName = arrOccs[i].scientificName;
        let canName = parseCanonicalFromScientific(arrOccs[i]);
        let taxRank = arrOccs[i].taxonRank.toUpperCase();
        let taxGnus = arrOccs[i].genus;
        if ('GENUS'==taxRank && !objGnus[taxGnus]) {
            objSpcs[taxGnus] = {
                'acceptedTaxonKey': arrOccs[i].acceptedTaxonKey,
                'scientificName': sciName,
                'taxonRank': taxRank,
                'vernacularName': arrOccs[i].vernacularName, //not used - see fillRow
                'image': false,
                'eventDate':  arrOccs[i].eventDate
            }
            objGnus[taxGnus]={'canonicalName':canName, 'taxonRank':taxRank};
        }
    }
    return {
        'head': hedSpcs, 
        'cols': ['Taxon Key','Scientific Name','Taxon Rank','Common Name','Image','Last Observed'], 
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
                colObj.innerHTML = `<a title="Wikipedia: ${spcKey}" href="https://en.wikipedia.org/wiki/${spcKey}">${val}</a>`;
                break;
            case 'eventDate':
                colObj = objRow.insertCell(colIdx++);
                colObj.innerHTML = val ? moment(val).format('YYYY-MM-DD') : '';
                break;
            case 'vernacularName': //don't use GBIF occurrence value for vernacularName, use VAL checklist or VAL google sheet
                colObj = objRow.insertCell(colIdx++);
                let key = objSpc.acceptedTaxonKey;
                //colObj.innerHTML = val ? val : (checklistVernacularNames[key] ? checklistVernacularNames[key][0].vernacularName : '');
                //colObj.innerHTML = val ? val : (sheetVernacularNames[key] ? sheetVernacularNames[key][0].vernacularName : '');
                colObj.innerHTML = checklistVernacularNames[key] ? checklistVernacularNames[key][0].vernacularName : (sheetVernacularNames[key] ? sheetVernacularNames[key][0].vernacularName : '');
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

function setLabelText(block, dataset=false, taxonKeys=false, count=0) {
if (eleLbl) {
eleLbl.innerHTML = 
`VT Butterfly Atlas Species List for Survey Block ${block}${dataset ? ' and dataset ' + dataset : ''}: (<u>${count} taxa</u>)`;
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
    await setLabelText(block, dataset, taxonKeys, Object.keys(spcs.array).length);
    delTableWait();
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