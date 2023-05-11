import { gbifCountsByWeek, gbifCountsByWeekByTaxonKey, gbifCountsByWeekByTaxonName } from '../VAL_Web_Utilities/js/gbifCountsByWeek.js';
import { datasetKeys } from "../VAL_Web_Utilities/js/fetchGbifSpecies.js";
import { getGbifSpeciesDataset, getGbifSpeciesByTaxonKey } from '../VAL_Web_Utilities/js/fetchGbifSpecies.js';
import { getGbifTaxonObjFromName } from '../VAL_Web_Utilities/js/commonUtilities.js';
import { tableSortHeavy } from '../VAL_Web_Utilities/js/tableSortHeavy.js'

const objUrlParams = new URLSearchParams(window.location.search);
const taxonNameA = objUrlParams.getAll('taxonName'); //Array of taxon names?
const taxonKeyA = objUrlParams.getAll('taxonKey'); //Array of taxon keys
const butterflies = objUrlParams.get('butterflies'); //Single query param
console.log('Query Param(s) taxonNames:', taxonNameA);
console.log('Query Param(s) taxonKeys:', taxonKeyA);
var offset = 0, limit = 10;
let off = Number(objUrlParams.get('offset'));
let lim = Number(objUrlParams.get('limit'));
offset = off ? off : offset;
limit = lim ? lim : limit;
console.log('offset', offset, 'limit', limit, 'off', off, 'lim', lim);
const butterflyKeys = 'taxonKey=6953&taxonKey=5473&taxonKey=7017&taxonKey=9417&taxonKey=5481&taxonKey=1933999';
/*
var other = ''; var objOther = {};
objUrlParams.forEach((val, key) => {
    if ('taxonName'!=key && 'taxonKey'!=key && 'butterflies'!=key) {
      other += `&${key}=${val}`;
      objOther[key] = val;
    }
  });
*/  
const eleTbl = document.getElementById("flightTimesTable");
const eleTtl = document.getElementById("flightTimesTitle");

var todayWeekColumnId = 0; //the columnId in the table of this week in the year, to (hopefully) auto-sort by that phenology

const waitDiv = document.getElementById("pageWait");
var waitObj;
async function addPageWait() {
    if (waitDiv) {    
        waitObj = document.createElement('i');
        console.log('addPageWait', waitObj);
        waitDiv.append(waitObj);
        waitObj.style = 'text-align: center;';
        waitDiv.style = 'text-align: center;';
        waitObj.innerHTML = `<i class="fa fa-spinner fa-spin" style="font-size:60px;"></i>`;
    } else {
        console.log('addPageWait | Element ID pageWait not found')
    }
}

async function delPageWait() {
    if (waitObj) {waitObj.remove();}
}

let monthName = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
//head row of month names every 4ish weeks
async function addWeekHead() {
    let colIdx = -1;
    let objHed = eleTbl.createTHead();
    let hedRow = objHed.insertRow(0);
    let colObj = hedRow.insertCell(++colIdx); colObj.innerText = 'Accepted';
    colObj = hedRow.insertCell(++colIdx); colObj.innerText = 'Common';
    colObj = hedRow.insertCell(++colIdx); colObj.innerText = 'VT Obs';
    let month = 0;
    for (var week=1; week<54; week++) {
        colObj = await hedRow.insertCell(colIdx + week);
        colObj.innerHTML = `<div class="weekHeaderNumber">${week}</div>`;
        let weeksPerMonth = 31/7;
        if (week/weeksPerMonth > month) {
            month++;
            colObj.innerHTML += `<div class="monthHeaderName">${monthName[month-1]}</div>`;
        } else {
            colObj.innerHTML += `<div class="monthHeaderName">&nbsp</div>`; //nbsp is required placeholder
        }
        colObj.classList.add('phenoCell');  
        colObj.addEventListener("click", (e) => {
            //console.log(e);
            //e.target.classList.toggle("weekHeaderSelected");
            //e.target.parentElement.classList.toggle("weekHeaderSelected");
        }); 
    }
}

async function addTaxonRow(pheno=false, taxon=false, rowIdx=0) {
    let colIdx = -1;
    let objRow = eleTbl.insertRow(rowIdx);
    //eleTbl.append(objRow); //doing this orders table rows properly, but causes dataTable to fail

    let objCol = objRow.insertCell(++colIdx);
    //let aTag = `<a title="GBIF Species Profile: ${taxon.canonicalName}" href="https://gbif.org/species/${taxon.nubKey}">${taxon.canonicalName}</a>`
    let aTag = `<a title="VAL Species Profile: ${taxon.canonicalName}" href="https://val.vtecostudies.org/species-profile?taxonName=${taxon.canonicalName}">${taxon.canonicalName}</a>`
    objCol.innerHTML = aTag;
    objCol.classList.add('taxonInfo');

    let verna = taxon.vernacularNames ? (taxon.vernacularNames.length ? taxon.vernacularNames[0].vernacularName : '') : '';
    verna = verna ? verna : (taxon.vernacularName ? taxon.vernacularName : '');
    objCol = objRow.insertCell(++colIdx); 
    objCol.innerText = verna;
    objCol.classList.add('taxonInfo');

    objCol = objRow.insertCell(++colIdx); 
    aTag = `<a title="VAL Data Explorer: ${taxon.canonicalName}" href="https://val.vtecostudies.org/gbif-explorer?taxonKey=${taxon.nubKey}&view=MAP">${pheno.total}</a>`
    objCol.innerHTML = aTag;
    objCol.classList.add('taxonInfo'); //row total VT Observations

    let month = 0;
    for (var week=1; week<54; week++) {
        let wCount = pheno.weekSum[week] ? pheno.weekSum[week] : 0;
        let wFreq = Math.ceil(wCount/pheno.total*100);
        wFreq = Math.ceil(wCount / Math.sqrt(wCount))
        let todayWeekClass = pheno.weekToday == week ? 'phenoCellToday' : false; 
        objCol = objRow.insertCell(colIdx + week);
        if (todayWeekClass) {
            objCol.classList.add(todayWeekClass);
            todayWeekColumnId = colIdx + week;
        }
        objCol.innerHTML += `<div class="phenoBarWeek" style="height:${wFreq}px;"></div>`;
        objCol.setAttribute('data-sort', `${wCount}`); //to sort by phenoWeek, must add the dataTables sort attribute to objCol, not inner div
        //objCol.setAttribute('data-order', `${wCount}`); //to sort by phenoWeek, must add the dataTables sort attribute to objCol, not inner div
        objCol.setAttribute('title',  `${wCount}=>${wFreq}`);
        objCol.classList.add('phenoCell');
    }
}

function setTitleText(text='VT Butterfly Atlas Flight Times', taxonNameA=[], taxonKeyA=[], butteflies=false, offset=false, limit=false) {
    if (eleTtl) {
        eleTtl.innerText = text;
    }
}

if (taxonNameA || taxonKeyA) {
    addPageWait();
    for (var i=0; i<taxonNameA.length; i++) {
        let taxonName = taxonNameA[i];
        let match = await getGbifTaxonObjFromName(taxonName); 
        console.log(`vbaFlightTimes=>getGbifTaxonObjFromName(${taxonName})`, match);
        let taxon = await getGbifSpeciesByTaxonKey(match.usageKey);
        console.log(`vbaFlightTimes=>getGbifSpeciesByTaxonKey(${taxon.canonicalName})`, taxon);
        let pheno = await gbifCountsByWeek(taxon.canonicalName);
        console.log(`vbaFlightTimes=>gbifCountsByWeek(${taxon.canonicalName})`, pheno);
        addTaxonRow(pheno, taxon, i);
    }
    for (var i=0; i<taxonKeyA.length; i++) {
        let taxonKey = taxonKeyA[i];
        let taxon = await getGbifSpeciesByTaxonKey(taxonKey);
        console.log(`vbaFlightTimes=>getGbifSpeciesByTaxonKey(${taxon.canonicalName})`, taxon);
        let pheno = await gbifCountsByWeekByTaxonKey(taxonKey);
        console.log(`vbaFlightTimes=>gbifCountsByWeekByTaxonKey(${taxonKey})`, pheno);
        addTaxonRow(pheno, taxon, i);
    }
    setTitleText(`Vermont Atlas of Life GBIF Phenology`, taxonNameA, taxonKeyA);
    addWeekHead();
    delPageWait();
} else if (butterflies) {
    let rowIdx = 0;
    addPageWait();
    let butts = await getGbifSpeciesDataset(datasetKeys['chkVtb1'],0,1000,'rank=SPECIES&rank=SUBSPECIES'); //the default checklist is VT Butterflies. Prolly should make that explicit, here.
    console.log(`vbaFlightTimes=>getGbifSpeciesDataset`, butts);
    offset = offset < butts.results.length ? offset : butts.results.length - 1;
    limit = (offset+limit) < butts.results.length ? limit : butts.results.length - offset;
    setTitleText();
    for (var i=offset; i<(offset+limit); i++) {
        let taxon = butts.results[i];
        if (('SPECIES' == taxon.rank.toUpperCase() || 'SUBSPECIES' == taxon.rank.toUpperCase()) && 'ACCEPTED' == taxon.taxonomicStatus.toUpperCase()) {
            let pheno = await gbifCountsByWeekByTaxonName(taxon.canonicalName);
            //let pheno = await gbifCountsByWeekByTaxonKey(taxon).nubKey);
            addTaxonRow(pheno, taxon, rowIdx++);
        }
    }
    addWeekHead();
    delPageWait();
} else {
    alert(`Must call with at least a query parameter like taxonName=Danaus plexippus. Alternatively pass butterflies=true, and use &offset=10&limit=10 to view content.`)
}

$('#flightTimesTable').ready(() => {
    let columnDefs =  [
        { "orderSequence": [ "asc", "desc" ], "targets": [ 0,1 ] },
        { "orderSequence": [ "desc", "asc" ], "targets": [ 2,3,4,5,6,7,8,9 ] },
        { "orderSequence": [ "desc", "asc" ], "targets": [ 10,11,12,13,14,15,16,17,18,19 ] },
        { "orderSequence": [ "desc", "asc" ], "targets": [ 20,21,22,23,24,25,26,27,28,29 ] },
        { "orderSequence": [ "desc", "asc" ], "targets": [ 30,31,32,33,34,35,36,37,38,39 ] },
        { "orderSequence": [ "desc", "asc" ], "targets": [ 40,41,42,43,44,45,46,47,48,49 ] },
        { "orderSequence": [ "desc", "asc" ], "targets": [ 50,51,52,53 ] }
    ];
    tableSortHeavy('flightTimesTable', todayWeekColumnId, [], columnDefs); //columnId 2 is VT Obs count
});