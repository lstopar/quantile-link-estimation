let qm = require('qminer');
let readline = require('readline');
let fs = require('fs');
let shuffle = require('shuffle-array');

let args = require('minimist')(process.argv.slice(2));

let quants = qm.analytics.quantiles;
let fname_in = args.in;
let fname_out = args.out;
let skip = args.skip;

if (skip == null) { skip = 30; }

let pvals = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
let quantileEps = 0.1;

let lines = [];
let attrDefs = [];

let lineReader = readline.createInterface({
    input: fs.createReadStream(fname_in)
});

console.log('reading file');
let isDataSection = false;
let rssiIdx = null;
let linkAttrN = null;
let attrDefN = -1;
lineReader.on('line', function (line) {
    if (!isDataSection) {
        if (line.startsWith('@DATA')) {
            isDataSection = true;
            return;
        }
        if (line.startsWith('@ATTRIBUTE')) {
            ++attrDefN;
            attrDefs.push(line.trim());
        }
        if (line.startsWith('@ATTRIBUTE rssi numeric')) {
            console.log('RSSI attribute has index ' + attrDefN);
            rssiIdx = attrDefN;
        }
        if (line.startsWith('@ATTRIBUTE link_num')) {
            console.log('link attribute has index ' + attrDefN);
            linkAttrN = attrDefN;
        }
    } else {
        lines.push(line.trim().split(','))
    }
})

let basicPreprocessor = function () {
    let model = new quants.Gk({
        eps: quantileEps
    })

    return function (lines) {
        console.log('all lines read, shuffling');
        shuffle(lines);

        console.log('modeling');
        for (let line of lines) {
            let value = parseFloat(line[rssiIdx]);
            let quantiles = model.quantile(pvals);
            model.insert(value);

            for (let quantile of quantiles) {
                line.push(quantile + '');
            }
        }

        return lines;
    }
}

let splitByLinkPreprocessor = function (attrN) {
    let modelH = new Map();

    if (attrN == null) throw new Error('Split attribute not defined!');

    return function (lines) {
        let outputLines = [];

        for (let lineN = 0; lineN < lines.length; ++lineN) {
            let line = lines[lineN];

            let value = parseFloat(line[rssiIdx]);
            let link = line[attrN];

            if (lineN % 10000 == 0) {
                console.log('processing link `' + link + '`, measurement `' + lineN + '`');
            }

            if (!modelH.has(link)) {
                let model = new quants.Gk({
                    eps: quantileEps
                })
                modelH.set(link, model);
            }

            let model = modelH.get(link);

            let quantiles = model.quantile(pvals);
            model.insert(value);

            let samplesSeen = model.samples;

            if (samplesSeen >= skip) {
                let outLine = JSON.parse(JSON.stringify(line));
                for (let quantile of quantiles) {
                    outLine.push(quantile + '');
                }
                outputLines.push(outLine);
            }
        }

        console.log('generated ' + outputLines.length + ' feature vectors with a total of ' + modelH.size + ' models');

        return outputLines;
    }
}

lineReader.on('close', function () {
    let preprocessor = splitByLinkPreprocessor(linkAttrN);
    let outLines = preprocessor(lines)

    console.log('writing output file');
    let fout = fs.openSync(fname_out, 'w');
    fs.writeSync(fout, '@RELATION output\n');

    console.log('writing previous attributes');
    for (let attrDef of attrDefs) {
        fs.writeSync(fout, '\n' + attrDef);
    }
    console.log('writing quantile attributes');
    for (let quantN = 0; quantN < pvals.length; ++quantN) {
        fs.writeSync(fout, '\n@ATTRIBUTE rssi-q-' + Math.floor(pvals[quantN]*100) + ' numeric');
    }
    fs.writeSync(fout, '\n@DATA\n');

    for (let lineN = 0; lineN < outLines.length; ++lineN) {
        let line = outLines[lineN];
        if (lineN < skip) { continue; }
        fs.writeSync(fout, '\n' + line.join(','));
    }

    fs.closeSync(fout);
    console.log('done!');
})
