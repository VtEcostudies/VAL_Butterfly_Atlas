import { gbifCountsByWeek, gbifCountsByWeekByTaxonKey, gbifCountsByWeekByTaxonName } from '../VAL_Web_Utilities/js/gbifCountsByWeek.js';
import { datasetKeys } from "../VAL_Web_Utilities/js/fetchGbifSpecies.js";
import { getGbifSpeciesDataset, getGbifSpeciesByTaxonKey } from '../VAL_Web_Utilities/js/fetchGbifSpecies.js';
import { getGbifTaxonObjFromName } from '../VAL_Web_Utilities/js/commonUtilities.js';
import { tableSortTrivial } from '../VAL_Web_Utilities/js/tableSortTrivial.js';
import { tableSortSimple } from '../VAL_Web_Utilities/js/tableSortSimple.js'
import { tableSortHeavy } from '../VAL_Web_Utilities/js/tableSortHeavy.js'

const objUrlParams = new URLSearchParams(window.location.search);
const taxonName = objUrlParams.get('taxonName'); //Single taxon name
const butterflies = objUrlParams.get('butterflies'); //Single taxon name
const taxonKeyA = objUrlParams.getAll('taxonKey'); //Array of taxon keys
console.log('Query Param(s) taxonKeys:', taxonKeyA);
var offset = 0, limit = 10;
let off = Number(objUrlParams.get('offset'));
let lim = Number(objUrlParams.get('limit'));
offset = off ? off : offset;
limit = lim ? lim : limit;
console.log('offset', offset, 'limit', limit, 'off', off, 'lim', lim);
const butterflyKeys = 'taxon_key=6953&taxon_key=5473&taxon_key=7017&taxon_key=9417&taxon_key=5481&taxon_key=1933999';
//var sheetVernacularNames = getSheetVernaculars();

var other = ''; var objOther = {};
objUrlParams.forEach((val, key) => {
    if ('taxonName'!=key && 'butterflies'!=key && 'taxonKey'!=key) {
      other += `&${key}=${val}`;
      objOther[key] = val;
    }
  });
  
const eleTbl = document.getElementById("flightTimesTable");
var todayWeekColumnId = 0; //the columnId in the table of this week in the year, to (hopefully) auto-sort by that phenology

let monthName = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
//head row of month names every 4ish weeks
async function addWeekHead() {
    let colIdx = -1;
    let objHed = eleTbl.createTHead();
    let hedRow = objHed.insertRow(0);
    let colObj = hedRow.insertCell(++colIdx); colObj.innerText = 'Accepted'; colObj.id = 'taxonName';
    colObj = hedRow.insertCell(++colIdx); colObj.innerText = 'Common'; colObj.id = 'commonName';
    colObj = hedRow.insertCell(++colIdx); colObj.innerText = 'VT Obs'; colObj.id = 'obsCount';
    let month = 0;
    for (var week=1; week<54; week++) {
        colObj = await hedRow.insertCell(colIdx + week);
        let weeksPerMonth = 31/7; //(366/12)/7;
        if (week/weeksPerMonth > month) {
            month++;
            colObj.innerText = monthName[month-1];
        }
    }
}

async function addTaxonRow(pheno=false, taxon=false, rowIdx=0) {
    let colIdx = -1;
    let objRow = await eleTbl.insertRow(rowIdx);
    let objCol = objRow.insertCell(++colIdx);
    objCol.innerHTML = `<a title="GBIF Species Profile: ${taxon.canonicalName}" href="https://gbif.org/species/${taxon.nubKey}">${taxon.canonicalName}</a>`;
    objCol.classList.add('taxonName');
    let verna = taxon.vernacularNames ? (taxon.vernacularNames.length ? taxon.vernacularNames[0].vernacularName : '') : '';
    verna = verna ? verna : taxon.vernacularName;
    objCol = objRow.insertCell(++colIdx); objCol.innerText = verna; objCol.classList.add('taxonName');
    objCol = objRow.insertCell(++colIdx); objCol.innerText = pheno.total; objCol.classList.add('taxonName'); //row total VT Observations
    let month = 0;
    for (var week=1; week<54; week++) {
        let wCount = pheno.weekSum[week] ? pheno.weekSum[week] : 0;
        let wFreq = Math.floor(wCount/pheno.total*100);
        let todayWeekClass = pheno.weekToday == week ? 'phenoCellToday' : false; 
        objCol = objRow.insertCell(colIdx + week);
        if (todayWeekClass) {
            objCol.classList.add(todayWeekClass);
            todayWeekColumnId = colIdx + week;
        }
        objCol.innerHTML += `<div class="phenoBarWeek" style="height:${wFreq}px;"></div>`;
        objCol.setAttribute('data-sort', `${wFreq}`); //to sort by phenoFreq, must add the dataTables sort attribute to objCol, not inner div
        objCol.setAttribute('title',  `${wCount}/${pheno.total}`);
    }
}

if (taxonName) {
    let match = await getGbifTaxonObjFromName(taxonName); 
    console.log(`vbaFlightTimes=>getGbifTaxonObjFromName(${taxonName})`, match);
    let taxon = await getGbifSpeciesByTaxonKey(match.usageKey);
    console.log(`vbaFlightTimes=>getGbifSpeciesByTaxonKey(${taxon.canonicalName})`, taxon);
    let pheno = await gbifCountsByWeek(taxon.canonicalName);
    console.log(`vbaFlightTimes=>gbifCountsByWeek(${taxon.canonicalName})`, pheno);
    addTaxonRow(pheno, taxon);
    addWeekHead();
} else if (butterflies) {
    let butts = await getGbifSpeciesDataset(datasetKeys['chkVtb1'],0,1000,'rank=SPECIES&rank=SUBSPECIES'); //the default checklist is VT Butterflies. Prolly should make that explicit, here.
    console.log(`vbaFlightTimes=>getGbifSpeciesDataset`, butts);
    offset = offset < butts.results.length ? offset : butts.results.length - 1;
    limit = (offset+limit) < butts.results.length ? limit : butts.results.length - offset;
    let rowIdx = 0;
    for (var i=offset; i<(offset+limit); i++) {
        let taxon = butts.results[i];
        if (('SPECIES' == taxon.rank.toUpperCase() || 'SUBSPECIES' == taxon.rank.toUpperCase()) && 'ACCEPTED' == taxon.taxonomicStatus.toUpperCase()) {
            let pheno = await gbifCountsByWeekByTaxonName(taxon.canonicalName);
            //let pheno = await gbifCountsByWeekByTaxonKey(taxon).nubKey);
            addTaxonRow(pheno, taxon, rowIdx++);
        }
    }
    addWeekHead();
} else {
    alert(`Must call with at least a query parameter like taxonName=Danaus plexippus. Alternatively pass butterflies=true, and use &offset=10&limit=10 to view content.`)
}

$('#flightTimesTable').ready(() => {
    tableSortHeavy('flightTimesTable', todayWeekColumnId, [], 'desc'); //columnId 2 is VT Obs count
    //tableSortSimple('flightTimesTable');
    //tableSortTrivial('flightTimesTable');
});