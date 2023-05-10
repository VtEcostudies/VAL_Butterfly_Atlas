import { gbifCountsByWeek, gbifCountsByWeekByTaxonKey, gbifCountsByWeekByTaxonName } from '../VAL_Web_Utilities/js/gbifCountsByWeek.js';
import { datasetKeys } from "../VAL_Web_Utilities/js/fetchGbifSpecies.js";
import { getGbifSpeciesDataset } from '../VAL_Web_Utilities/js/fetchGbifSpecies.js';

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

let monthName = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
//head row of month names every 4ish weeks
async function addWeekHead() {
    let objHed = eleTbl.createTHead();
    let hedRow = objHed.insertRow(0);
    let colObj = hedRow.insertCell(0); colObj.innerText = 'Taxon'
    colObj = hedRow.insertCell(1); colObj.innerText = 'Common'
    colObj = hedRow.insertCell(2); colObj.innerText = 'VT Obs'
    let month = 0;
    for (var week=1; week<54; week++) {
        colObj = await hedRow.insertCell(2 + week);
        if (week/4.41667 > month) {
            month++;
            colObj.innerText = monthName[month-1];
        }
    }
}

async function addTaxonRow(pheno=false, vernacular=false, rowIdx=0) {
    let idxCol = 0;
    let objRow = await eleTbl.insertRow(rowIdx);
    let objCol = objRow.insertCell(0); objCol.innerText = pheno.taxonName ? pheno.taxonName: pheno.search.split('=')[1]; objCol.classList.add('taxonName');
    objCol = objRow.insertCell(1); objCol.innerText = vernacular ? vernacular : ''; objCol.classList.add('taxonName');
    objCol = objRow.insertCell(2); objCol.innerText = pheno.total; objCol.classList.add('taxonName'); //row total VT Observations
    let month = 0;
    for (var week=1; week<54; week++) {
        let wCount = pheno.weekSum[week] ? pheno.weekSum[week] : 0;
        let wFreq = Math.floor(wCount/pheno.total*100);
        let todayWeekClass = pheno.weekToday == week ? 'phenoCellToday' : false; 
        objCol = objRow.insertCell(2 + week);
        if (todayWeekClass) {objCol.classList.add(todayWeekClass);}
        objCol.innerHTML += `<div class="phenoBarWeek" style="height:${wFreq}px;"></div>`;
    }
}

if (taxonName) {
    //addTableWait();
    let pheno = await gbifCountsByWeek(taxonName);
    console.log(`vbaFlightTimes=>gbifCountsByWeek(${taxonName})`, pheno);
    addTaxonRow(pheno);
    addWeekHead();
    //delTableWait();
} else if (butterflies) {
    let butts = await getGbifSpeciesDataset(datasetKeys['chkVtb1'],0,1000,'rank=SPECIES&rank=SUBSPECIES'); //the default checklist is VT Butterflies. Prolly should make that explicit, here.
    console.log(`vbaFlightTimes=>getGbifSpeciesDataset`, butts);
    offset = offset < butts.results.length ? offset : butts.results.length - 1;
    limit = (offset+limit) < butts.results.length ? limit : butts.results.length - offset;
    for (var i=offset; i<(offset+limit); i++) {
        console.log('RANK:', butts.results[i].rank.toUpperCase())
        if (('SPECIES' == butts.results[i].rank.toUpperCase() || 'SUBSPECIES' == butts.results[i].rank.toUpperCase()) && 'ACCEPTED' == butts.results[i].taxonomicStatus.toUpperCase()) {
            let pheno = await gbifCountsByWeekByTaxonName(butts.results[i].canonicalName);
            //let pheno = await gbifCountsByWeekByTaxonKey(butts.results[i].nubKey);
            let verna = butts.results[i].vernacularNames.length ? butts.results[i].vernacularNames[0].vernacularName : false;
            addTaxonRow(pheno, verna);
        }
    }
    addWeekHead();
} else {
    alert(`Must call with at least a query parameter like taxonName=Danaus plexippus. Alternatively pass butterflies=true, and use &offset=10&limit=10 to view content.`)
}
