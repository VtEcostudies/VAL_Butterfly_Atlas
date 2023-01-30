import { googleApiKey } from "./secrets.js";

let defaultSheetIds = {
    "signUps": '1O5fk2pDQCg_U4UNzlYSbewRJs4JVgonKEjg3jzDO6mA',
    "vernacular": '17_e15RB8GgpMVZgvwkFHV8Y9ZgLRXg5Swow49wZsAyQ'
}

export var sheetSignUps; //store sheetSignUps at file scope
export var sheetVernacularNames; //store sheetVernacularNames for multi-use

/*
    Fetch a single Google sheet's data by sheet ID and ordinal sheet number.
    
*/
export async function fetchGoogleSheetData(spreadsheetId=defaultSheetIds.signUps, sheetNumber=0) {
    let apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/?key=${googleApiKey}&includeGridData=true`;

    try {
        let res = await fetch(apiUrl);
        //console.log(`fetchGoogleSheetData(${spreadsheetId},${sheetNumber}) RAW RESULT:`, res);
        if (res.status > 299) {return res;}
        let json = await res.json();
        //console.log(`fetchGoogleSheetData(${spreadsheetId}) JSON RESULT:`, json);
        let prop = json.sheets[sheetNumber].properties;
        let head = json.sheets[sheetNumber].data[0].rowData[0].values;
        let data = json.sheets[sheetNumber].data[0].rowData.slice(1);
        //console.log(`Sheet-${sheetNumber} properties:`, prop);
        //console.log(`Sheet-${sheetNumber} row header:`, head);
        //console.log(`Sheet-${sheetNumber} row data:`, data);
        return {'properties':prop, 'head':head, 'rows':data};
    } catch (err) {
        console.log(`fetchGoogleSheetData(${spreadsheetId}) ERROR:`, err);
        return new Error(err)
    }
}

export async function getSheetSignups(sheetNumber=0) {
    try {
        let res = await fetchGoogleSheetData(defaultSheetIds.signUps, sheetNumber);
        //console.log('getSheetSignups RESULT:', res);
        if (res.status > 299) {return res;}
        let sign = [];
        res.rows.forEach(row => {
            if (row.values[1]) { //if sheet's row values are deleted but row is not deleted, API returns row of empty values!!!
                sign[row.values[1].formattedValue] = {
                    'last':row.values[4].formattedValue, 
                    'first':row.values[3].formattedValue,
                    'date':row.values[0].formattedValue
                }
            }
    })
    console.log('getSheetSignups 2D ARRAY', sign);
    return sign;
    } catch(err) {
        console.log(`getSheetSignups(${sheetNumber}) ERROR:`, err);
        return new Error(err)
    }
}

export async function getSheetVernaculars(sheetNumber=0) {
    try {
        let res = await fetchGoogleSheetData(defaultSheetIds.vernacular, sheetNumber);
        //console.log('getSheetVernaculars RESULT:', res);
        if (res.status > 299) {return res;}
        let name = [];
        res.rows.forEach((row,rid) => {
            //console.log('row:', rid);
            let data = {}
            /*
            Build a JSON object using headRow keys with eachRow values like {head[i]:row.value[i], head[i+1]:row.value[i+1], ...}
            */
            res.head.forEach((col,idx) => { //Asynchronous loop works here! This is better UX so use it.
            //for (var idx=0; idx<res.head.length; idx++) { let col = res.head[idx]; //synchronous loop works but delays page loading...
                let val = row.values[idx];
                //console.log('head:', idx, col.formattedValue);
                //console.log('col:', idx, val ? val.formattedValue : null);
                data[col.formattedValue] = val ? val.formattedValue : null;
            })
            //console.log(`Row ${rid} JSON:`, data);
            /*
                Now we have a JSON header-keyed row of data. Use specific keys to build a 2D Array of vernacular names like this:
                name[taxonId][0] = {head1:row1value1, head2:row1value2, ...}
                name[taxonId][1] = {head1:row2value1, head2:row2value2, ...}
                name[taxonId][N] = {head1:rowNvalue1, head2:rowNvalue2, ...}
            */
            if (name[data.taxonId]) { //We assume that if the 1st Dimension exists, the 2nd Dimension has been instantiated, as below.
                name[data.taxonId].push(data);
                //console.log('duplicate', name[data.taxonId]);
            } else {
                name[data.taxonId] = []; //We must instantiate a 2D array somehow before we push values on the the 1st Dimension
                name[data.taxonId][0] = data;
            }
        })
        //console.log('getSheetVernaculars 2D ARRAY', name);
        return name;
    } catch(err) {
        console.log(`getSheetVernaculars(${sheetNumber}) ERROR:`, err);
        return new Error(err)
    }
}

sheetSignUps = await getSheetSignups();
sheetVernacularNames = await getSheetVernaculars();