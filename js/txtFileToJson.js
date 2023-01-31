/*
    This is a callable node.js processor to convert GBIF tab-delimited occurrence download files to json.
*/
const fs = require('fs');
const { csvFileTo2DObject } = require('C:/Users/jtloo/Documents/VCE/VAL_Data_Pipelines/VAL_Utilities/99_parse_csv_to_array.js');
const csvFile = {
    'test': '../occ/vtb2_occs_2008-2022_abbrev.tsv',
    'vtb1': '../occ/vtb1_occs_1000-2001.tsv',
    'vtb2': '../occ/vtb2_occs_2008-2022.tsv',
    'vba1': '../occ/vba1_occs.tsv',
};
const includeColumns = ['gbifID','datasetKey','taxonRank','scientificName','occurrenceStatus','decimalLatitude','decimalLongitude','eventDate','taxonKey','identifiedBy','dateIdentified','recordedBy']
const excludeRowTests = {
    'vtb1': (rowO) => {
        if ((new Date(rowO.eventDate).getTime() >= new Date('2002').getTime())) {console.log('excluded', rowO.gbifID, rowO.eventDate)};
        return (new Date(rowO.eventDate).getTime() >= new Date('2002').getTime());
    }
}

async function getJsonFromCsv(dataset='vba1', excludeRowTest=()=>{return false}) {
    let outPath = csvFile[dataset].split('.')[0] + '.json';
    let ws = fs.createWriteStream(outPath);
    let json = await csvFileTo2DObject(csvFile[dataset],'\t',true,false,includeColumns,excludeRowTest);
    let text = JSON.stringify(json);
    console.log('json text size:', text.length);
    await ws.write(text);
    ws.close();
    ws.on('close', async () => {
        console.log('file closed:', outPath);
    })

    return json;
}

getJsonFromCsv('vtb1', excludeRowTests.vtb1);
