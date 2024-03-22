import { getOccsByFilters } from '../VAL_Web_Utilities/js/fetchGbifOccs.js';
import { getWikiPage } from '../VAL_Web_Utilities/js/wikiPageData.js'
import { parseCanonicalFromScientific } from '../VAL_Web_Utilities/js/commonUtilities.js';
import { getSheetVernaculars } from '../VAL_Web_Utilities/js/fetchGoogleSheetsData.js';
import { checklistVtButterflies, checklistVernacularNames, getParentRank } from '../VAL_Web_Utilities/js/fetchGbifSpecies.js'; //file gets 2 lists on load
import { fetchInatGbifDatasetInfo, fetchEbutGbifDatasetInfo, datasetKeys, gbifDatasetUrl } from "../VAL_Web_Utilities/js/fetchGbifDataset.js";
import { init,draw,update } from './doubleSlider.js';
import { getInatSpecies } from '../VAL_Web_Utilities/js/inatSpeciesData.js';

let vtNameIndex = {}; let vtTkeyIndex = {};
for (const spc of checklistVtButterflies.results) {
    vtNameIndex[spc.canonicalName] = spc; //VT Butterflies indexed by name
    vtTkeyIndex[spc.key] = spc; //VT Butterflies indexed by species-list key
}
//console.log(vtNameIndex);
//console.log(vtTkeyIndex);

const objUrlParams = new URLSearchParams(window.location.search);
const geometry = objUrlParams.get('geometry');
const dataset = objUrlParams.get('dataset');
const block = objUrlParams.get('block');
const year = objUrlParams.get('year');
const taxonKeyA = objUrlParams.getAll('taxonKey');
console.log('Query Param(s) taxonKeys:', taxonKeyA);
const yearMin = 1800;
const yearMax = 2030;

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
const eleAtlas = document.getElementById('atlas');
const eleMin = document.getElementById('min');
const eleMax = document.getElementById('max');

var sliders = document.querySelectorAll('.min-max-slider');

if (year) {
    let yrs = year.split(',');
    let min = yrs[0] ? Number(yrs[0]) : yearMin;
    let max = yrs[1] ? Number(yrs[1]) : yearMax;
    let avg = Math.floor((min + max)/2);
    console.log('Set slider to year values', min, max, avg);
    eleMin.setAttribute("data-value", min);
    eleMax.setAttribute("data-value", max);
    sliders.forEach(slider => {draw(slider, avg)});
    eleAtlas.value=null;
}

eleAtlas.addEventListener("change", ev => {
    let val = ev.target.value;
    console.log(ev.target);
    let min = yearMin;
    let max = yearMax;
    let avg = Math.floor((min + max)/2);

    switch(val) {
        case "A": //All years
            min = yearMin;
            max = yearMax;
            break;
        case "B": //before VBA1
            min = yearMin;
            max = 2001;
            break;
        case "1": //VBA1
            min = 2002;
            max = 2007;
            break;
        case "T": //between VBA1 and VBA2 
            min = 2008;
            max = 2022;
            break;
        case "2": //VBA2
            min = 2023;
            max = 2027;
            break;
        case "R": //After VBA2
            min = 2028;
            max = yearMax;
            break;
    }
    avg = Math.floor((min + max)/2);
    eleMin.setAttribute("data-value", min);
    eleMax.setAttribute("data-value", max);
    sliders.forEach(slider => {draw(slider, avg);});
    loadPage(block, geometry, taxonKeyA, `${min},${max}`);
})

eleMin.addEventListener("change", ev => {
    console.log(ev.target.value, ev);
    let min = parseInt(ev.target.value);
    let max = parseInt(eleMax.value);
    loadPage(block, geometry, taxonKeyA, `${min},${max}`);
    eleAtlas.value=null;

})
eleMax.addEventListener("change", ev => {
    console.log(ev.target.value, ev);
    let max = parseInt(ev.target.value);
    let min = parseInt(eleMin.value);
    loadPage(block, geometry, taxonKeyA, `${min},${max}`);
    eleAtlas.value=null;

})

async function getBlockSpeciesListVT(block='block_name', dataset=false, gWkt=false, tKeys=false, years=false) {

    let occs = await getOccsByFilters(0,300,dataset,gWkt,false,tKeys,years);
    //console.log('getBlockSpeciesListVT', occs);
    let hedSpcs = 'Species List for ' + block + (dataset ? ` and dataset ${dataset}` : '')
    let objSpcs = {}; let objGnus = {};
    let arrOccs = occs.results;
    //console.log('getBlockSpeciesListVT', block, arrOccs);
    for (var i=0; i<arrOccs.length; i++) {
        let occ = arrOccs[i];

        let sciFull = occ.scientificName;
        let sciName = parseCanonicalFromScientific(occ, 'scientificName');
        let canName = sciName;
        let sciKey = occ.key;

        let accFull = occ.acceptedScientificName;
        let accName = parseCanonicalFromScientific(occ, 'acceptedScientificName');
        let accKey = occ.acceptedTaxonKey;
        let accRank = occ.taxonRank.toUpperCase(); //occ RANK is accepted RANK, not original RANK
        let accSpcs = occ.species; //The accepted name's SPECIES
        let accGnus = occ.genus;

        if (sciName != accName) { //To-Do: does occ API return accName when GBIF backbone agrees with the taxon ID?
            console.log('getBlockSpeciesListVT found occurrence having SYNONYM', sciName, accName, occ);
        }

        let tax2Use =  false; let taxFrom = false; let spc = false;
        if (vtNameIndex[sciName]) {
            //console.log('FOUND ORIGINAL', sciName, 'in VT Index', vtNameIndex[sciName]);
            tax2Use = sciName;
            taxFrom = 'VT Butterflies <- GBIF Original';
            spc = vtNameIndex[sciName];
            spc.eventDate = occ.eventDate; spc.gbifId = occ.gbifID; spc.taxonSource = taxFrom;
        } else if (vtNameIndex[accName]) {
            //console.log('FOUND BACKBONE', accName, 'in VT Index', vtNameIndex[accName]);
            tax2Use = accName;
            taxFrom = 'VT Butterflies <- GBIF Accepted';
            spc = vtNameIndex[accName];
            spc.eventDate = occ.eventDate; spc.gbifId = occ.gbifID; spc.taxonSource = taxFrom;
        } else {
            //console.log('NEITHER FOUND', sciName, accName, 'using Occ:', occ);
            tax2Use = accName;
            taxFrom = 'GBIF Backbone Accepted';
            spc = occ;
            spc.taxonSource = taxFrom;
        }

        if (spc.synonym && spc.accepted) {
            let accSynN = parseCanonicalFromScientific(spc, 'accepted', 'rank');
            console.log('SYNONYM', tax2Use, spc, 'ACCEPTED:', accSynN, vtNameIndex[accSynN]);
            tax2Use = accSynN;
            spc = vtNameIndex[accSynN]; //we assume this is always valid
            taxFrom = 'VT Butterflies <- GBIF Synonym';
            spc.eventDate = occ.eventDate; spc.gbifId = occ.gbifID; spc.taxonSource = taxFrom;
        }

        if ('SUBSPECIES'==spc.rank) {
            console.log('SUBSPECIES:', tax2Use, spc); 
            if (spc.species) {
                let subspKey = spc.key;
                tax2Use = spc.species;
                spc = vtNameIndex[tax2Use];
                taxFrom += ' <- Subsp.';
                spc.subspKey = subspKey;
                spc.eventDate = occ.eventDate; spc.gbifId = occ.gbifID; spc.taxonSource = taxFrom;
            } else {
                console.log('SUBSPECIES INCOMPLETE - NO parent SPECIES defined. Name:', tax2Use, 'species:', spc.species, 'parent:', spc.parent);
            }
        }

        if (objSpcs[tax2Use]) { //We already added this taxon to our list. Check to replace name with more recent observation.
            if (spc.eventDate > objSpcs[tax2Use].eventDate) { //newer date. replace existing.
                console.log('getBlockSpeciesListVT FOUND MORE RECENT OBSERVATION for', canName, spc.eventDate, '>', objSpcs[tax2Use].eventDate);
                objSpcs[tax2Use] = setDisplayObj(tax2Use, spc);
            }
        } else { //Species taxon NOT found in our index. Add it.
            objSpcs[tax2Use] = setDisplayObj(tax2Use, spc);
/*
            if ('SPECIES'==spc.rank) { //Always add SPECIES
                objSpcs[tax2Use] = setDisplayObj(tax2Use, spc);
            }
*/
        }
    }
    console.log('FINISHED SPECIES LIST  ', objSpcs);
    return {
        'head': hedSpcs, 
        //'cols': ['Taxon Key','Accepted Key','Applied Name','Accepted Name','Taxon Rank','Status','Source','Common Name','Image','Last Observed'], 
        'cols': {taxonKey:'Taxon Key',scientificName:'Name',family:'Family',taxonRank:'Rank',taxonSource:'Source',vernacularName:'Common Name',image:'Image',eventDate:'Last Observed'}, 
        'array': objSpcs, 
        'query': occs.query
    };
}

//Object keys from a species list are different from keys from an occurrence search...
function setDisplayObj(tax2Use, spc) {
    return {
        'taxonKey': spc.key,
        'acceptedTaxonKey': spc.acceptedKey ? spc.acceptedKey : spc.acceptedTaxonKey,
        'subspKey': 'SUBSPECIES'==spc.rank ? spc.acceptedTaxonKey : false, //what is this reassignment?
        'speciesKey': spc.speciesKey, 'species': spc.species,
        'scientificName': tax2Use,
        'acceptedName': spc.accepted ? spc.accepted : spc.acceptedScientificName,
        'genusKey': spc.genusKey, 'genus': spc.genus,
        'familyKey': spc.familyKey, 'family': spc.family,
        'taxonRank': spc.rank,
        'taxonStatus': spc.taxonomicStatus,
        'taxonSource': spc.taxonSource,
        'vernacularName': spc.vernacularName ? spc.vernacularName : (spc.vernacularNames ? (spc.vernacularNames[0] ? spc.vernacularNames[0].vernacularName : false) : false),
        'vernacularNames': spc.vernacularNames ? spc.vernacularNames : [],
        'image': false,
        'eventDate': spc.eventDate,
        'gbifId': spc.gbifId
    }
}
    
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
async function getBlockSpeciesList(block='block_name', dataset=false, gWkt=false, tKeys=false, years=false) {

    let occs = await getOccsByFilters(0,300,dataset,gWkt,false,tKeys,years);
    //console.log('getBlockSpeciesList', occs);
    let hedSpcs = 'Species List for ' + block + (dataset ? ` and dataset ${dataset}` : '')
    let objSpcs = {}; let objGnus = {};
    let arrOccs = occs.results;
    console.log('getBlockSpecieslist', block, arrOccs);
    for (var i=0; i<arrOccs.length; i++) {
        let sciName = parseCanonicalFromScientific(arrOccs[i], 'scientificName');
        let accName = parseCanonicalFromScientific(arrOccs[i], 'acceptedScientificName');
        let canName = parseCanonicalFromScientific(arrOccs[i], 'scientificName');
        let sciFull = arrOccs[i].scientificName;
        let accFull = arrOccs[i].acceptedScientificName;
        let sciKey = arrOccs[i].key;
        let accKey = arrOccs[i].acceptedTaxonKey;
        let taxRank = arrOccs[i].taxonRank.toUpperCase();
        let taxSpcs = arrOccs[i].species;
        let taxGnus = arrOccs[i].genus;
        if (sciName != accName) {
            console.log('getBlockSpeciesList found occurrence having SYNONYM', canName, accName, taxRank, taxSpcs, arrOccs[i]);
        }
        /*
            Due to errors in GBIF butterfly taxonomies, we show both the 'Applied' name submitted with the original observation,
            and the 'Accepted' name matched from the GBIF backbone. The values we get from the occurrence API, 'species' and
            'speciesKey', 'genus' and 'genusKey', needed here to show Species List style values from occurrence results, derive
            from the Accepted name.
        */
        if (objSpcs[taxSpcs]) { //check to replace name with more recent observation
            if (arrOccs[i].eventDate > objSpcs[taxSpcs].eventDate) { //newer date. replace existing.
                console.log('getOccsByFilters FOUND MORE RECENT OBSERVATION for', sciName, arrOccs[i].eventDate, '>', objSpcs[taxSpcs].eventDate);
                objSpcs[taxSpcs] = {
                    'taxonKey': arrOccs[i].taxonKey, //this is supposedly a key to the original observation taxon, Applied Name
                    'acceptedTaxonKey': arrOccs[i].speciesKey, //arrOccs[i].acceptedTaxonKey, //here's where we substitute SPECIES for SUBSP. in our list
                    'subspKey': 'SUBSPECIES'==taxRank ? arrOccs[i].acceptedTaxonKey : false,
                    'scientificName': taxSpcs, //sciName
                    'acceptedName': accName,
                    'taxonRank': 'SPECIES', //taxRank
                    'vernacularName': arrOccs[i].vernacularName, //not used - see fillRow
                    'image': false,
                    'eventDate':  arrOccs[i].eventDate,
                    'gbifId': arrOccs[i].gbifID
                };
            }
        } else { //add new name here only if rank is SPECIES or SUBSPECIES. Deal with GENUS not represented by SPECIES later.
            if ('SPECIES'==taxRank || 'SUBSPECIES'==taxRank) { //...but roll SUBSP into SPECIES...
                objSpcs[taxSpcs] = {
                    'taxonKey': arrOccs[i].taxonKey,
                    'acceptedTaxonKey': arrOccs[i].speciesKey, //arrOccs[i].acceptedTaxonKey,
                    'subspKey': 'SUBSPECIES'==taxRank ? arrOccs[i].acceptedTaxonKey : false,
                    'scientificName': taxSpcs, //sciName
                    'acceptedName': accName,
                    'taxonRank': 'SPECIES', //taxRank,
                    'vernacularName': arrOccs[i].vernacularName, //not used - see fillRow
                    'image': false,
                    'eventDate':  arrOccs[i].eventDate,
                    'gbifId': arrOccs[i].gbifID
                };
                objGnus[taxGnus]={'canonicalName':canName, 'taxonRank':taxRank}; //add to checklist of GENUS already represented in list
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
//async function addTableHead(headCols=['Taxon Key','Scientific Name','Taxon Rank','Common Name','Image','Last Observed']) {
async function addTableHead(headCols={taxonKey:'Taxon Key',scientificName:'Scientific Name',taxonRank:'Taxon Rank',vernacularName:'Common Name',image:'Image',eventDate:'Last Observed'}) {
    console.log('HEADER COLUMNS', headCols);
    let objHed = eleTbl.createTHead();
    let hedRow = objHed.insertRow(0);
    let colObj;
/*
    for (var i=0; i<headCols.length; i++) {
        colObj = hedRow.insertCell(i);
        colObj.innerText = headCols[i];
    }
*/
    var i=0;
    for (const key in headCols) {
        colObj = hedRow.insertCell(i++);
        colObj.innerText = headCols[key];
    }
}
  
//Create table row for each array element, then fill row of cells
async function addTaxaFromArr(objArr, hedObj) {
    //console.log('addTaxaFromArr', objArr);
    let rowIdx=0;
    for (const [spcKey, objSpc] of Object.entries(objArr)) {
        //console.log(objSpc, rowIdx)
        let objRow = await eleTbl.insertRow(rowIdx);
        await fillRow(spcKey, objSpc, objRow, rowIdx++, hedObj);
    }
  }

//Create cells for each object element
async function fillRow(spcKey, objSpc, objRow, rowIdx, hedObj) {
    let colIdx = 0;
    for (const [key, val] of Object.entries(objSpc)) {
        let colObj; // = objRow.insertCell(colIdx++);
        let rawKey = objSpc.taxonKey;
        let accKey = objSpc.acceptedTaxonKey;
        //console.log('key:', key);
        console.log('fillRow', key, val, hedObj[key], hedObj[`${key}`])
        if (hedObj[key]) { //filter species object through header object
        switch(key) {
            case 'image':
                colObj = objRow.insertCell(colIdx++);
                colObj.innerHTML = `<i class="fa fa-spinner fa-spin" style="font-size:18px"></i>`;
                let inat = getInatSpecies(spcKey, objSpc.taxonRank, objSpc.parent, getParentRank(objSpc.taxonRank)); 
                inat.catch(err=> {console.log('getInatSpecies ERROR', err); getWikImg();});
                inat.then(inat => {
                    if (inat.default_photo) {
                        colObj.innerHTML = '';
                        let iconImg = document.createElement("img");
                        iconImg.src = inat.default_photo.medium_url;
                        iconImg.alt = inat.default_photo.attribution;
                        iconImg.className = "icon-image";
                        iconImg.width = "30"; 
                        iconImg.height = "30";
                        let hrefImg = document.createElement("a");
                        hrefImg.href = inat.default_photo.medium_url;
                        hrefImg.target = "_blank";
                        colObj.appendChild(hrefImg);
                        hrefImg.appendChild(iconImg);
                    } else {getWikImg();}
                })
                function getWikImg() {
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
                }
                break;
            case 'scientificName':
                colObj = objRow.insertCell(colIdx++);
                //colObj.innerHTML = `<a title="Wikipedia: ${spcKey}" href="https://en.wikipedia.org/wiki/${spcKey}">${val}</a>`;
                //colObj.innerHTML = `<a title="VAL Species Profile: ${val}" href="https://val.vtecostudies.org/species-profile?siteName=vtButterflies&taxonName=${val}">${val}</a>`;
                colObj.innerHTML = `<a title="VAL Species Profile: ${val}" href="https://val.vtecostudies.org/species-profile?siteName=vtButterflies&taxonKey=${rawKey}&taxonName=${val}">${val}</a>`;
                break;
            case 'acceptedName':
                colObj = objRow.insertCell(colIdx++);
                if (val) {
                    colObj.innerHTML = `<a title="VAL Species Profile: ${val}" href="https://val.vtecostudies.org/species-profile?siteName=vtButterflies&taxonKey=${accKey}&taxonName=${val}">${val}</a>`;
                } else {colObj.innerHTML = '';}
                break;
            case 'eventDate':
                colObj = objRow.insertCell(colIdx++);
                let rang = val.split('/'); if (rang[1]) {console.log(`Occurrence having date range: ${val}`);}
                let date = val ? val.split('/')[0] : false;
                date = date ? moment(date).format('YYYY-MM-DD') : 'N/A';
                //let date = val ? moment(val).format('YYYY-MM-DD') : 'N/A';
                colObj.innerHTML = colObj.innerHTML = `<a title="GBIF Occurrence Record: ${objSpc.gbifId} Date: ${val}" href="https://gbif.org/occurrence/${objSpc.gbifId}">${date}</a>`;
                break;
            case 'vernacularName': //don't use GBIF occurrence value for vernacularName, use VAL checklist or VAL google sheet
                colObj = objRow.insertCell(colIdx++);
                //colObj.innerHTML = val ? val : (checklistVernacularNames[key] ? checklistVernacularNames[key][0].vernacularName : '');
                //colObj.innerHTML = val ? val : (sheetVernacularNames[key] ? sheetVernacularNames[key][0].vernacularName : '');
                //if (checklistVernacularNames[key]) {console.log('vernacularNames for', key, checklistVernacularNames[key].map(ky => ky.vernacularName).join(','));}
                //colObj.innerHTML = checklistVernacularNames[key] ? checklistVernacularNames[key][0].vernacularName : (sheetVernacularNames[key] ? sheetVernacularNames[key][0].vernacularName : '');
                //colObj.innerHTML = checklistVernacularNames[key] ? checklistVernacularNames[key] : (sheetVernacularNames[key] ? sheetVernacularNames[key][0].vernacularName : '');
                colObj.innerHTML = val ? val : (sheetVernacularNames[accKey] ? sheetVernacularNames[taxKey][0].vernacularName : '');
                break;
            case 'taxonKey':
                colObj = objRow.insertCell(colIdx++);
                colObj.innerHTML = `<a title="Gbif Species Profile: ${val}" href="https://gbif.org/species/${val}">${val}</a>`;
                break;
            case 'acceptedTaxonKey':
                colObj = objRow.insertCell(colIdx++);
                if (val) {
                    colObj.innerHTML = `<a title="Gbif Species Profile: ${val}" href="https://gbif.org/species/${val}">${val}</a>`;
                } else {colObj.innerHTML = '';}
                break;
            case 'taxonRank':
                colObj = objRow.insertCell(colIdx++);
                colObj.innerHTML = val ? val : '';
                if (objSpc.subspKey) {
                    colObj.innerHTML += ` <a title="Gbif Subspecies Profile: ${objSpc.subspKey}" href="https://gbif.org/species/${objSpc.subspKey}">(from Subsp.)</a>`;
                }
                break;
            case 'taxonStatus':
                colObj = objRow.insertCell(colIdx++);
                colObj.innerHTML = val;
                break;
            case 'taxonSource':
                colObj = objRow.insertCell(colIdx++);
                colObj.innerHTML = val;
                break;
            case 'family':
                colObj = objRow.insertCell(colIdx++);
                colObj.innerHTML = val;
                break;
            default:
                //colObj.innerHTML = val ? val : '';
                break;
        }
        } //end if (hedObj[key])
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
async function loadPage(block, geometry, taxonKeyA, year) {
    let taxonKeys;
    eleTbl.innerHTML = "";
    addTableWait();
    //vernaculars = await getVernaculars();
    if (!dataset && !taxonKeyA.length) {taxonKeys = butterflyKeys;}
    if (taxonKeyA.length) {
        taxonKeys = taxonKeyA.map(key => key.join(','));
    }
    let spcs = await getBlockSpeciesListVT(block, dataset, geometry, taxonKeys, year);
    await addGBIFLink(geometry, taxonKeys);
    await addTaxaFromArr(spcs.array, spcs.cols);
    await addTableHead(spcs.cols);
    setTitleText(block, dataset, taxonKeys, Object.keys(spcs.array).length);
    delTableWait();
    setEbutInfo();
    setInatInfo();
    setDataTable(); //MUST be called after table has finished updating.
    setPageUrl(block, geometry, taxonKeyA, year);
}

//Set page URL to in-page settings without reloading the page
async function setPageUrl(block, geometry, taxonKeyA, year) {
    //console.log('BEFORE', decodeURI(objUrlParams.toString()));
    if (year) {objUrlParams.set('year', `${year}`);}
    const thisUrl = new URL(document.URL);
    const homeUrl = `${thisUrl.protocol}//${thisUrl.host}`;
    let stateObj = {block:block, geometry:geometry, taxonKeyA:taxonKeyA, year:year};
    let stateUrl = `${homeUrl}${thisUrl.pathname}?${decodeURI(objUrlParams.toString())}`;
    //console.log('AFTER', stateUrl);
    history.replaceState(stateObj, "", stateUrl);
}

if (block && geometry) {
    loadPage(block, geometry, taxonKeyA, year);
} else {
    alert(`Must call with at least the query parameters 'block' and 'geometry'. Alternatively pass a dataset (like 'vba1') or one or more eg. 'taxonKey=1234'.`)
}

let tableSort = false;
async function setDataTable() {
/*
    for (var i=0; i<eleTbl.rows.length; i++) {
        console.log(`TABLE ROW ${i} COLUMN COUNT:`, eleTbl.rows[i].cells.length)
    }
*/
    if (tableSort) {
        tableSort.clear();
        tableSort.destroy();
        tableSort = $('#speciesListTable').DataTable();    
    } else {
        tableSort = $('#speciesListTable').DataTable();
    }
}
/* DEPRECATED in favor of direct call after awaiting all updates in pageLoad
    $('#speciesListTable').ready(function () {
        setDataTable()
    });
*/

