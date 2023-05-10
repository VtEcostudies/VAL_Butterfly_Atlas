import { gbifCountsByWeek, gbifCountsByWeekByTaxonKey, gbifCountsByWeekByTaxonName } from '../VAL_Web_Utilities/js/gbifCountsByWeek.js';
import { datasetKeys, gbifDatasetUrl } from "../VAL_Web_Utilities/js/fetchGbifDataset.js";
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
    let colObj = hedRow.insertCell(0); colObj.innerText = 'Name'
    colObj = hedRow.insertCell(1); colObj.innerText = 'VT Obs'
    let month = 0;
    for (var week=1; week<54; week++) {
        colObj = await hedRow.insertCell(1 + week);
        if (week/4.41667 > month) {
            month++;
            colObj.innerText = monthName[month-1];
        }
    }
}

//Create table row for each array element, then fill row of cells
async function addTaxonWeeksArr(objArr) {
    //console.log('addTaxaFromArr', objArr);
    let rowIdx=0;
    for (const [spcKey, objSpc] of Object.entries(objArr)) {
        //console.log(objSpc, rowIdx)
        let objRow = await eleTbl.insertRow(rowIdx);
        await addTaxonRow(pheno, '', rowIdx++);
    }
  }

async function addTaxonRow(pheno=false, vernacular=false, rowIdx=0) {
    let idxCol = 0;
    let objRow = await eleTbl.insertRow(rowIdx);
    let objCol = objRow.insertCell(0); objCol.innerText = vernacular ? vernacular : pheno.search.split('=')[1]; //row name
    objCol = objRow.insertCell(1); objCol.innerText = pheno.total; //row total count
    let month = 0;
    for (var week=1; week<54; week++) {
        let wCount = pheno.weekSum[week] ? pheno.weekSum[week] : 0;
        let wFreq = Math.floor(wCount/pheno.total*100);
        let todayWeekClass = pheno.weekToday == week ? 'phenoCellToday' : false; 
        objCol = objRow.insertCell(week+1);
        if (todayWeekClass) {objCol.classList.add(todayWeekClass);}
        objCol.innerHTML += `<div class="phenoBarWeek" style="height:${wFreq}px;"></div>`;
    }
}

if (taxonName) {
    //addTableWait();
    let pheno = await gbifCountsByWeek(taxonName);
    addTaxonRow(pheno);
    addWeekHead();
    //delTableWait();
} else if (butterflies) {
    let butts = await getGbifSpeciesDataset();
    console.log(butts);
    for (var i=offset; i<(offset+limit); i++) {
        if ('ACCEPTED' == butts.results[i].taxonomicStatus) {
        //let pheno = await gbifCountsByWeekByTaxonName(butts.results[i].canonicalName);
        let pheno = await gbifCountsByWeekByTaxonKey(butts.results[i].nubKey);
        addTaxonRow(pheno, butts.results[i].vernacularNames[0].vernacularName);
        /*
        gbifCountsByWeekByTaxonName(butts.results[i].canonicalName)
            .then(pheno => {
                addTaxonRow(pheno);
            })
        */
        }
    }
    addWeekHead();
} else {
    alert(`Must call with at least a query parameter like taxonName=Danaus plexippus. Alternatively pass butterflies=true, and use &offset=10&limit=10 to view content.`)
}
