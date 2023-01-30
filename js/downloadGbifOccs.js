import { getOccsByFilters } from './fetchGbifOccs.js';

var abortData = false;

async function fetchData(off=0, lim=900, filter) {
    var res = [];
    let page = {}; //page of data
    let size = 300; //gbif max page size, usually called 'limit'
    let cnt = 0;
    let err = false;
    do {
      page = await getOccsByFilters(off, size);
      err = page instanceof Error;
      res = res.concat(page.results);
      off += size; //record offset to retrieve from
      cnt += size; //count of records retrieved
    } while (!page.endOfRecords && !err && !abortData && cnt<lim);
    if (err) {console.log(`downloadGbifOccs::fetchData ERROR`, err);}
    return res;
  }

//Download qParm full-result set as csv (type==0) or json (type==1)
async function getDownloadData(type=1, filter='') {
    let off = 0;
    let lim = 300;
    let occ = await fetchData(off, lim, filter); //returns just an array of occurrences, not a parent object with counts, etc.
    var name = `occs_${off}_${off+occ.length}`; //download file name
    if (filter) {name += `_${filter}`;} //add search term to download file name
    if (type) { //json-download
        var jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(occ));
        downloadData(jsonStr, name + ".json") ;
    } else { //csv-download
        var res = jsonToCsv(occ);
        var csvStr = "data:text/csv;charset=utf-8," + encodeURIComponent(res);
        downloadData(csvStr, name + ".csv") ;
    }
  }

//do the download
function downloadData(dataStr, expName) {
    var downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", expName);
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  }

//convert json array of objects to csv
function jsonToCsv(json) {
    const replacer = (key, value) => value === null ? '' : value // specify how you want to handle null values here
    const header = Object.keys(json[0])
    const csv = [
      header.join(','), // header row first
      ...json.map(row => header.map(fieldName => JSON.stringify(row[fieldName], replacer)).join(','))
    ].join('\r\n')
  
    return csv;
  } 

if (document.getElementById("download-json")) {
    document.getElementById("download-json").addEventListener("mouseup", function(e) {
      getDownloadData(1);
    });}
if (document.getElementById("download-csv")) {
    document.getElementById("download-csv").addEventListener("mouseup", function(e) {
      getDownloadData(0);
    });}
