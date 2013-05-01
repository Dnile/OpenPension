var fs = require('fs'),
    zip = require('node-zip'),
    parseString = require('xml2js').parseString;

var fileDataInUtf8 = function(uz, fname) {
      return new Buffer(uz.files[fname].data, 'ascii').toString('utf8');
};


var readSheetCell = function(uz, sheet, cellId) {
  
  var row = 0,
      col = 0;

  var i;
  for (i = 0; i < cellId.length; ++i) {
    if (cellId[i] < 65) {
      break;
    }

    col *= 10;
    col += cellId.charCodeAt(i) - 65; // cell[i] - 'A';
  }


  rowNumber = parseInt(cellId.substr(i), 10); // the row number the user is looking for (1-based)
  
  if(rowNumber < 1){  //check for row number validity, TODO: check outer bounds
     throw ("Index out of bounds: "+ rowNumber);
  }

//patch, sometimes not all columns are present under row node in the xml structure.
//for example, first column under row 6 can be B6 and A6 is missing :
//<row r="6" spans="1:15" ht="15" x14ac:dyDescent="0.25">
//  <c r="B6" s="25" t="s">
//    <v>103</v> 
//  </c>
//  ...
//in this case, look for column iteratively by cell id.
//since columns might only be missing, 
//the requested cell must be in a lower col index
//
//as this is kinda ugly, we might want to iteratively look for the cell in the first place 

  zeroBasedRowNumber = rowNumber - 1;   //zero based row number

  candidateCell = sheet.worksheet.sheetData[0].row[zeroBasedRowNumber].c[col];

  candidateCellAddress = candidateCell.$.r;

  if(candidateCellAddress != cellId){ //cell address is not as expected, find cell iteratively
  //  console.log("looking for :"+ cellId);
    for(j=col; j >= 0; j--){
      if(sheet.worksheet.sheetData[0].row[zeroBasedRowNumber].c[j].$.r == cellId){ //found requested cell id!
        col = j;
        break;
      }
    }
    if(j<0){ //cell not found, maybe missing in xml structure, return empty string
      return "";
    }
  }

  var cellValue = sheet.worksheet.sheetData[0].row[zeroBasedRowNumber].c[col].v;
  var cellStyle = sheet.worksheet.sheetData[0].row[zeroBasedRowNumber].c[col].$.s;
  var cellType = sheet.worksheet.sheetData[0].row[zeroBasedRowNumber].c[col].$.t;

  console.log("cellStyle:"+cellStyle);
  console.log("cellType:"+cellType);
  console.log("cellValue:"+cellValue);


//TODO: move this up in function call trace?


  var sharedStringsArray;

  if(cellType == "s"){ //value is stored in sharedSting.xml, get value from file
      parseString(fileDataInUtf8(uz, 'xl/sharedStrings.xml'), function (err, sheet) {
        if (err) {
          handler(err, null);
          return;
        }

        sharedStringsArray = sheet.sst.si;
      });    
    return sharedStringsArray[cellValue].t;
  }

  
  if(cellValue===undefined){ //cell is empty
    return "";
  }
  else{
    return cellValue[0];
  }

};


// handler = function(err, result)
var readSheet = function(uz, sheetId, handler) {
  
  parseString(fileDataInUtf8(uz, 'xl/worksheets/sheet' + sheetId + '.xml'), function (err, sheet) {
    if (err) {
      handler(err, null);
      return;
    }

    handler(null, readSheetCell.bind(this, uz, sheet));
  });
};

// handler = function(err, result)
exports.readFile = function(filename, handler) {
  fs.readFile(filename, "binary", function(err, data) {
    if (err) {
      handler(err, null);
      return;
    }
    var uz;
    try{
      uz = new zip(data, { base64: false, checkCRC32: true});
    } catch(e) {
      handler(null, e);
      return;
    }



    parseString(fileDataInUtf8(uz, 'xl/workbook.xml'), function (err, workbook) {
      if (err) {
        handler(err, null);
        return;
      }

      var result = {
        sheets: []
      };
      workbook.workbook.sheets[0].sheet.forEach(function(s){
        //console.log(s);
        result.sheets.push({
          name: s.$.name,
          id: s.$.sheetId,
          read: readSheet.bind(this, uz, s.$.sheetId)
        });
      });
      handler(null, result);
    });
  });

};


exports.getFileSheetsNames = function(fileName, callback){
  exports.readFile(fileName, function(err, result) {
    callback(null,result.sheets.map(function(s){return s.name}));
  })
}

exports.getCellValue = function(filename, sheet, cellName, callback){
  exports.readFile(filename, function(err, result) {
    var _sheet = result.sheets.filter(function(s){return s.name == sheet})[0]
    if (!_sheet) throw new Error("sheet not found!");
    _sheet.read(function(err,result){
      var value = result(cellName);
      callback(null,value);
    })
  })
}

