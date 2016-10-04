Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    items: [
        {
            xtype: 'container',
            itemId: 'exportBtn',
            cls: 'export-button'
        },
        {
            xtype: 'container',
            itemId: 'comboboxContainer',
            cls: 'combo-box'
        },
        {
            xtype: 'container',
            itemId: 'iterationComboboxContainer',
            cls: 'combo-box'
        },
        {
            xtype: 'container',
            itemId: 'submitButton',
            cls: 'submit-button'
        },
        {
            xtype: 'container',
            itemId: 'gridContainer'
        }
    ],
    launch: function() {
        
        this._myMask = new Ext.LoadMask(Ext.getBody(), {msg:"Loading data..."});
        this._myMask.show();
        
        this.down('#comboboxContainer').add({
            xtype: 'rallyreleasecombobox',
            itemId: 'stateComboBox',
            allowNoEntry: true,
            noEntryText: 'All Releases',
            value: 'PSI 12',
            model: ['userstory'],
            listeners: {
                scope: this
            }
        });
        
        this.down('#comboboxContainer').add({
            xtype: 'rallyiterationcombobox',
            itemId: 'iterationComboBox',
            allowNoEntry: true,
            noEntryText: 'All Iterations',
            model: ['userstory'],
            listeners: {
                scope: this,
                ready: this._initStore
            }
        });
        
        this.down('#submitButton').add({
            text:'Filter Stories',
            xtype: 'button',
            listeners: {
                click: this._submitFilter,
                scope: this
            }
        });
    },
    _getStateFilter: function() {
        this._myMask.show();

        var Dependencies = Rally.data.QueryFilter.or([{
            property: 'Predecessors.ObjectID',
            operator: '!=',
            value: null
        }, {
            property: 'Successors.ObjectID',
            operator: '!=',
            value: null
        }]);
        
        if(this.down('#iterationComboBox').getRawValue() !== "All Iterations") { 
            var iterationFilter = {
                property: 'Iteration.Name',
                operator: '=',
                value: this.down('#iterationComboBox').getRawValue().split(' (')[0]
            };
        }
        
        if(this.down('#stateComboBox').getRawValue() !== "All Releases") {
            var releaseFilter = {
                property: 'Release.Name',
                operator: '=',
                value: this.down('#stateComboBox').getRawValue().split(' (')[0]
            };
        }
        
        if (!releaseFilter && !iterationFilter) {
            return Dependencies;
        } else if (releaseFilter && iterationFilter ) {
            return Dependencies
                .and(Ext.create('Rally.data.QueryFilter', releaseFilter))
                .and(Ext.create('Rally.data.QueryFilter', iterationFilter));
        } else if (!releaseFilter && iterationFilter) {
            return Dependencies
                .and(Ext.create('Rally.data.QueryFilter', iterationFilter));
        } else {
            return Dependencies
            .and(Ext.create('Rally.data.QueryFilter', releaseFilter));
        }    
    },
    _submitFilter: function() {
        var store = this._store;

        store.clearFilter(true);
        store.filter(this._getStateFilter());
    },
   _initStore: function() {
        var scope = this;
        this._store = Ext.create('Rally.data.wsapi.Store', {
            model: 'UserStory',
            autoLoad: true,
            remoteSort: false,
            fetch:[
        	    'FormattedID', 
            	'Name',
            	'Project',
            	'Release',
            	'Feature',
            	'Milestones',
            	'ScheduleState',
            	'Successors',
            	'Iteration',
            	'DueDate',
            	'Predecessors'
        	],
        	filters:  Rally.data.QueryFilter.or([{
                property: 'Predecessors.ObjectID',
                operator: '!=',
                value: null
            }, {
                property: 'Successors.ObjectID',
                operator: '!=',
                value: null
            }]),
            limit: Infinity,
            listeners: {
                load: this._onDataLoaded,
                scope: this
            }
        });
    },
    _onDataLoaded: function(store, data) {
        
        if(data.length === 0) {
            this._makeGrid(data);
            return;
        }
        
        var stories = new Map(),
            promises = [],
            self = this;
        _.each(data, function(story) {
            var s = { 
            	Feature: story.get('Feature'), 
            	FormattedID: story.get('FormattedID'), 
            	StoryNumericID: Number(story.get('FormattedID').replace(/\D+/g, '')),
            	Name: story.get('Name'), 
            	Project: (story.get('Project') ? story.get('Project').Name : ''),
            	Release: (story.get('Release') ? story.get('Release').Name : ''),
            	_ref: story.get('_ref'), 
            	Predecessor: {},
            	PredName: '',
            	PredNumericID: '',
            	PredProject: '',
            	PredScheduleState: '',
            	PredIteration: '',
            	PredIterationSortNum: 0,
            	PredDueDate: null,
            	Successor: {},
            	SuccName: '',
            	SuccNumericID: '',
            	SuccProject: '',
            	SuccScheduleState: '',
            	SuccIteration: '',
            	SuccIterationSortNum: 0,
            	StoryScheduleState: story.get('ScheduleState'),
            	Iteration: (story.get('Iteration') ? story.get('Iteration').Name : ''),
                DueDate: story.get('DueDate')
            };
            
            if (s.Feature) {
                s.FeatureName = s.Feature.Name;

                //s.FeatureNumericID is an integer, so that the Feature ID sort will compare numbers instead of strings
                s.FeatureNumericID = Number(s.Feature.FormattedID.replace(/\D+/g, ''));
            }
            
            s.IterationSortNumber = this._getSortableIteration(s.Iteration);
            
            var predecessorsStore = story.getCollection('Predecessors');
            var predecessorPromise = predecessorsStore.load({
                fetch: ['FormattedID', 'Name', 'Project', 'ScheduleState', 'Iteration', 'DueDate']
            });

            var successorsStore = story.getCollection('Successors');
            var successorPromise = successorsStore.load({
                fetch: ['FormattedID', 'Name', 'Project', 'ScheduleState', 'Iteration']
            });
            
            promises.push(predecessorPromise, successorPromise);
            story.PredecessorsStore = predecessorsStore;
            story.SuccessorsStore = successorsStore;

            stories.set(s.FormattedID, s);
            
        }, this);
        
        //wait for all stores to load
        Deft.Promise.all(promises).then({
            success: function() {
                _.each(data, function(story) {
                    
                    var storyDuplicationArray = [];
                    
                    var predecessorsArray = story.PredecessorsStore.getRange();
                    _.each(predecessorsArray, function(predecessor) {
                        var s = JSON.parse(JSON.stringify(stories.get(story.get('FormattedID'))));
                        var iteration = (predecessor.get('Iteration') ? predecessor.get('Iteration').Name : '');
                        s.Predecessor = {
                            _ref: predecessor.get('_ref'), 
                			FormattedID: predecessor.get('FormattedID')
                        };
                        s.PredName = predecessor.get('Name');
                        s.PredNumericID = Number(s.Predecessor.FormattedID.replace(/\D+/g, ''));
                        s.PredProject = (predecessor.get('Project') ? predecessor.get('Project').Name : '');
                        s.PredScheduleState = predecessor.get('ScheduleState');
                        s.PredIteration = iteration;
                        s.PredIterationSortNum = self._getSortableIteration(iteration);
                        s.PredDueDate = predecessor.get('DueDate');
                        storyDuplicationArray.push(s);
                    });
                    
                    var successorsArray = story.SuccessorsStore.getRange();
                    _.each(successorsArray, function(successor) {
                        var s = JSON.parse(JSON.stringify(stories.get(story.get('FormattedID'))));
                        var iteration = (successor.get('Iteration') ? successor.get('Iteration').Name : '');
                        s.Successor = { 
	            			_ref: successor.get('_ref'), 
	            			FormattedID: successor.get('FormattedID')
	            		};
	            		s.SuccName = successor.get('Name');
	            		s.SuccNumericID = Number(s.Successor.FormattedID.replace(/\D+/g, ''));
	            		s.SuccProject = (successor.get('Project') ? successor.get('Project').Name : '');
	            		s.SuccScheduleState = successor.get('ScheduleState');
	            		s.SuccIteration = iteration;
	            		s.SuccIterationSortNum = self._getSortableIteration(iteration);
                        storyDuplicationArray.push(s);
                    });
             
                    if(storyDuplicationArray.length !== 0) {
                        stories.set(story.get('FormattedID'), storyDuplicationArray);
                    }
                    
                });
                
                var storiesArray = this._getStoriesArray(stories);
                this._makeGrid(storiesArray);
            },
            scope: this
        });
    },
    
    _getSortableIteration: function(_iterationStr) {
        if(!!_iterationStr) {
            var iterationStr = _iterationStr.split(' ')[1];
            var iterationDecimal = iterationStr.split('.')[1].charCodeAt(0) - 64;
            iterationStr = iterationStr.split('.')[0] + '.' + iterationDecimal;
            return Number(iterationStr);
        } else {
            return 0;
        }
    },
    _getStoriesArray: function(storiesMap) {
        var storiesArray = [];
        storiesMap.forEach(function(value, key) {
            if(Array.isArray(value)) {
                _.each(value, function(storyItem){
                    storiesArray.push(storyItem);
                });
            } else {
                storiesArray.push(value);
            }
        }, storiesMap);
        return storiesArray;
    },
    _makeGrid:function(stories){
        this._myMask.hide();
        var store = Ext.create('Rally.data.custom.Store', {
            data: stories,
            sorters: [
                { property: 'IterationSortNumber', direction: 'DESC' },
                { property: 'Project', direction: 'ASC'}
            ],
            proxy: {
                type:'memory'
            }
        });
        
        if (!this._grid) {
            this._stories = stories;
            this._grid = Ext.create('Rally.ui.grid.Grid',{
                itemId: 'storiesGrid',
                store: store,
                
                showRowActionsColumn: false,
                showPagingToolbar: false,
                columnCfgs: [
                {
                    text: 'Predecessor ID', dataIndex: 'Predecessor', tdCls: 'grey-background', width: 75, align: 'center',
                    getSortParam: function() {
                      return 'PredNumericID';  
                    },
                    renderer: function(value, meta) {
                        meta.tdCls = 'grey-background';
                        return value.FormattedID ? '<a href="' + Rally.nav.Manager.getDetailUrl(value) + '" target="_blank">' + value.FormattedID + "</a>" : void 0;
                    }
                }, {
                    text: 'Predecessor Name', dataIndex: 'PredName',  tdCls: 'grey-background', width: 175
                }, {
                    text: 'Predecessor Project', dataIndex: 'PredProject',  tdCls: 'grey-background'
                }, {
                    text: 'Predecessor State', dataIndex: 'PredScheduleState',  tdCls: 'grey-background', width: 75
                }, {
                    text: 'Predecessor Iteration', dataIndex: 'PredIteration',  tdCls: 'grey-background', width: 70,
                    getSortParam: function() {
                	    return 'PredIterationSortNum';
                    }
                }, {
                    text: 'Predecessor Due Date', dataIndex: 'PredDueDate',  tdCls: 'grey-background', xtype: 'datecolumn', format: 'D n/j/Y', width: 75
                }, { 
                	text: 'Story ID', dataIndex: 'FormattedID', xtype: 'templatecolumn', width: 75, tpl: Ext.create('Rally.ui.renderer.template.FormattedIDTemplate'),
                	getSortParam: function() {
                	    return 'StoryNumericID';
                    }
                }, { 
                	text: 'Story Name', dataIndex: 'Name', width: 175,
                }, { 
                	text: 'Story Project', dataIndex: 'Project'
                }, {
                    text: 'Story State', dataIndex: 'StoryScheduleState', width: 75,
                }, {
                    text: 'Release', dataIndex: 'Release',
                }, {
                    text: 'Story Iteration', dataIndex: 'Iteration', width: 70,
                    getSortParam: function() {
                	    return 'IterationSortNumber';
                    }
                }, {
                    text: 'Story Due Date', dataIndex: 'DueDate', xtype: 'datecolumn', format: 'D n/j/Y', width: 75
                }, {
                    text: 'Feature ID', dataIndex: 'Feature', width: 65, align: 'center',
                    getSortParam: function() {
                        return 'FeatureNumericID';  
                    },
                    renderer: function(value) {
                        return value ? '<a href="' + Rally.nav.Manager.getDetailUrl(value) + '" target="_blank">' + value.FormattedID + "</a>" : void 0;
                    }
                }, {
                    text: 'Feature Name', dataIndex: 'FeatureName', width: 175
                }, {
                    text: 'Successor ID', dataIndex: 'Successor',  tdCls: 'grey-background', width: 75, align: 'center',
                    getSortParam: function() {
                      return 'SuccNumericID';  
                    },
                    renderer: function(value) {
                        return value.FormattedID ? '<a href="' + Rally.nav.Manager.getDetailUrl(value) + '" target="_blank">' + value.FormattedID + "</a>" : void 0;
                    }
                }, {
                    text: 'Successor Name', dataIndex: 'SuccName',  tdCls: 'grey-background', width: 175
                }, {
                    text: 'Successor Project', dataIndex: 'SuccProject',  tdCls: 'grey-background'
                }, {
                    text: 'Successor State', dataIndex: 'SuccScheduleState',  tdCls: 'grey-background', width: 75
                }, {
                    text: 'Successor Iteration', dataIndex: 'SuccIteration',  tdCls: 'grey-background', width: 70,
                    getSortParam: function() {
                	    return 'SuccIterationSortNum';
                    }
                }]
            });
            this.down('#gridContainer').add(this._grid);
            this.down('#exportBtn').add({
                xtype: 'rallybutton',
                text: 'Export to CSV',
                handler: this._onClickExport,
                scope: this
            });
        } else {
            this._grid.reconfigure(store);
        }
    },

    _onClickExport: function(){
        var data = this._getCSV();
        window.location = 'data:text/csv;charset=utf8,' + encodeURIComponent(data);
    },
    
    _getCSV: function () {
        
        var cols    = this._grid.columns;
        var data = '';

        _.each(cols, function(col, index) {
                data += this._getFieldTextAndEscape(col.text) + ',';
        },this);
        
        data += "\r\n";
        _.each(this._stories, function(record) {
            _.each(cols, function(col, index) {
                var text = '';
                var fieldName = col.dataIndex;
                if ((fieldName === 'Predecessor' || fieldName === 'Successor' || fieldName === 'Feature') && !!record[fieldName]) {
                    text = record[fieldName].FormattedID;
                } else if (fieldName.indexOf('DueDate') !== -1 && !!record[fieldName]) {
                    if(typeof record[fieldName] === 'string') {
                        text = record[fieldName].split('T')[0];
                    } else {
                        text = Ext.Date.format(record[fieldName], 'Y-m-d');
                    }
                } else {
                    text = record[fieldName];
                }
                
                data += this._getFieldTextAndEscape(text) + ',';

            },this);
            data += "\r\n";
        },this);

        return data;
    },
    _getFieldTextAndEscape: function(fieldData) {
        var string  = this._getFieldText(fieldData);  
        return this._escapeForCSV(string);
    },
    _getFieldText: function(fieldData) {
        var text;
        if (fieldData === null || fieldData === undefined || !fieldData.match) {
            text = '';
        } else if (fieldData._refObjectName) {
            text = fieldData._refObjectName;
        }else {
            text = fieldData;
        }

        return text;
    },
     _escapeForCSV: function(string) {
        if (string.match(/,/)) {
            if (!string.match(/"/)) {
                string = '"' + string + '"';
            } else {
                string = string.replace(/,/g, ''); 
            }
        }
        return string;
    }
});
