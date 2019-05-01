/**
* Copyright 2012-2019, Plotly, Inc.
* All rights reserved.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/

'use strict';

var Lib = require('../../lib');
var Registry = require('../../registry');
var axisIds = require('../../plots/cartesian/axis_ids');

var handleGroupingDefaults = require('../bar/defaults').handleGroupingDefaults;
var attributes = require('./attributes');

var nestedProperty = Lib.nestedProperty;

var BINATTRS = {
    x: [
        {aStr: 'xbins.start', name: 'start'},
        {aStr: 'xbins.end', name: 'end'},
        {aStr: 'xbins.size', name: 'size'},
        {aStr: 'nbinsx', name: 'nbins'}
    ],
    y: [
        {aStr: 'ybins.start', name: 'start'},
        {aStr: 'ybins.end', name: 'end'},
        {aStr: 'ybins.size', name: 'size'},
        {aStr: 'nbinsy', name: 'nbins'}
    ]
};

        // in overlay mode make a separate group for each trace
        // otherwise collect all traces of the same subplot & orientation
        //
        // TODO
        // - group overlay trace with same bingroup
        // - can we have bingroup apply to the x and y bins at the same time? (yes, but of same ax.type)
        // - does bingroup make sense across different axes?? (yes, but of same ax.type)
        // - should we even coerce bingroup for barmode other than 'overlay'?? (make the current groupName the dflt)

// handle bin attrs and relink auto-determined values so fullData is complete
module.exports = function crossTraceDefaults(fullData, fullLayout) {
    var allBinOpts = fullLayout._histogramBinOpts = {};
    var isOverlay = fullLayout.barmode === 'overlay';
    var i, j, k, traceOut, binDir, group, binOpts;

    function coerce(attr, dflt) {
        return Lib.coerce(traceOut._input, traceOut, attributes, attr, dflt);
    }

    for(i = 0; i < fullData.length; i++) {
        traceOut = fullData[i];

        if(!Registry.traceIs(traceOut, 'histogram')) continue;

        // TODO: this shouldn't be relinked as it's only used within calc
        // https://github.com/plotly/plotly.js/issues/749
        delete traceOut._autoBinFinished;

        var is2dMap = Registry.traceIs(traceOut, '2dMap');

        var binDirections = is2dMap ?
            ['x', 'y'] :
            traceOut.orientation === 'v' ? ['x'] : ['y'];

        for(k = 0; k < binDirections.length; k++) {
            binDir = binDirections[k];

            var binGroupDflt = null;
            if(!isOverlay && !is2dMap) {
                binGroupDflt = (
                    axisIds.getAxisGroup(fullLayout, traceOut.xaxis) +
                    axisIds.getAxisGroup(fullLayout, traceOut.yaxis) +
                    binDir
                );
            }

            group = coerce('bingroup', binGroupDflt);
            // N.B. group traces that don't have a bingroup with themselves
            // using trace uid and bin direction
            if(!group) group = traceOut.uid + '_' + binDir;

            var axType = axisIds.getFromTrace({_fullLayout: fullLayout}, traceOut, binDir).type;
            binOpts = allBinOpts[group];

            if(binOpts) {
                if(axType === binOpts.axType) {
                    binOpts.traces.push(traceOut);
                } else {
                    Lib.warn('!!!');
                }
            } else {
                binOpts = allBinOpts[group] = {
                    traces: [traceOut],
                    binDir: binDir,
                    axType: axType
                };
            }

            traceOut['_groupName' + binDir] = group;
        }

        if(!is2dMap) {
            handleGroupingDefaults(traceOut._input, traceOut, fullLayout, coerce);
        }
    }

    for(group in allBinOpts) {
        binOpts = allBinOpts[group];
        binDir = binOpts.binDir;

        var attrs = BINATTRS[binDir];
        var autoVals;

        for(j = 0; j < attrs.length; j++) {
            var attrSpec = attrs[j];
            var attr = attrSpec.name;

            // nbins(x|y) is moot if we have a size. This depends on
            // nbins coming after size in binAttrs.
            if(attr === 'nbins' && binOpts.sizeFound) continue;

            var aStr = attrSpec.aStr;
            for(i = 0; i < binOpts.traces.length; i++) {
                traceOut = binOpts.traces[i];
                if(nestedProperty(traceOut._input, aStr).get() !== undefined) {
                    binOpts[attr] = coerce(aStr);
                    binOpts[attr + 'Found'] = true;
                    break;
                }

                autoVals = (traceOut._autoBin || {})[binDir] || {};
                if(autoVals[attr]) {
                    // if this is the *first* autoval
                    nestedProperty(traceOut, aStr).set(autoVals[attr]);
                }
            }
            // start and end we need to coerce anyway, after having collected the
            // first of each into binOpts, in case a trace wants to restrict its
            // data to a certain range
            if(attr === 'start' || attr === 'end') {
                for(; i < binOpts.traces.length; i++) {
                    traceOut = binOpts.traces[i];
                    autoVals = (traceOut._autoBin || {})[binDir] || {};
                    coerce(aStr, autoVals[attr]);
                }
            }

            if(attr === 'nbins' && !binOpts.sizeFound && !binOpts.nbinsFound) {
                traceOut = binOpts.traces[0];
                binOpts[attr] = coerce(aStr);
            }
        }
    }
};
