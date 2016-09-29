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
            cls: 'milestone-combo-box'
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
            model: ['userstory'],
            listeners: {
                scope: this,
                select: this._onSelect,
                ready: this._initStore
            }
        });
   },
    _getStateFilter: function() {
        return {
            property: 'Release',
            operator: '=',
            value: this.down('#stateComboBox').getRawValue()
        };
    },
    _onSelect: function() {
        var store = this._grid.getStore();
    
        store.clearFilter(true);
        if (this.down('#stateComboBox').getRawValue() !== "-- No Entry --") {
            store.filter(this._getStateFilter());
        } else {
            store.reload();
        }
    },
   _initStore: function() {
        Ext.create('Rally.data.wsapi.Store', {
            model: 'UserStory',
            autoLoad: true,
            remoteSort: false,
            fetch:[
        	    "FormattedID", 
            	"Name",
            	"Project",
            	"Release",
            	"Feature",
            	"Milestones",
            	"ScheduleState",
            	"Successors",
            	"Iteration",
            	"DueDate"
        	],
            limit: Infinity,
            listeners: {
                load: this._onDataLoaded,
                scope: this
            }
        });
       
        this._featureStore = Ext.create('Rally.data.wsapi.Store', {
            model: 'PortfolioItem',
            autoLoad: true,
            remoteSort: false,
            fetch:[
        	    "FormattedID", 
            	"State"
        	],
            limit: Infinity
       });
    },
    _onDataLoaded: function(store, data) {
        var stories = new Map(),
            promises = [],
            self = this;
        _.each(data, function(story) {
            var s = { 
            	Feature: story.get("Feature"), 
            	FormattedID: story.get("FormattedID"), 
            	StoryNumericID: Number(story.get("FormattedID").replace(/\D+/g, '')),
            	Name: story.get("Name"), 
            	Project: (story.get("Project") ? story.get("Project").Name : ""),
            	Release: (story.get("Release") ? story.get("Release").Name : ""),
            	_ref: story.get("_ref"), 
            	Predecessor: {},
            	PredIterationSortNum: 0,
            	Successor: {},
            	SuccIterationSortNum: 0,
            	StoryScheduleState: story.get("ScheduleState"),
            	Iteration: (story.get("Iteration") ? story.get("Iteration").Name : ""),
    			DueDate: story.get("DueDate"),
    			
            };
            
            if (s.Feature) {
                s.FeatureName = s.Feature.Name;

                //s.FeatureNumericID is an integer, so that the Feature ID sort will compare numbers instead of strings
                s.FeatureNumericID = Number(s.Feature.FormattedID.replace(/\D+/g, ''));
            }
            
            s.IterationSortNumber = this._getSortableIteration(s.Iteration);
            
            var predecessorsStore = story.getCollection("Predecessors");
            var predecessorPromise = predecessorsStore.load({
                fetch: ["FormattedID", "Name", "Project", "ScheduleState", "Iteration", "DueDate"]
            });

            var successorsStore = story.getCollection("Successors");
            var successorPromise = successorsStore.load({
                fetch: ["FormattedID", "Name", "Project", "ScheduleState", "Iteration"]
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
                        var s = JSON.parse(JSON.stringify(stories.get(story.get("FormattedID"))));
                        var iteration = (predecessor.get("Iteration") ? predecessor.get("Iteration").Name : "");
                        s.Predecessor = {
                            _ref: predecessor.get("_ref"), 
                			FormattedID: predecessor.get("FormattedID"), 
                			Name: predecessor.get("Name"),
                			Project: (predecessor.get("Project") ? predecessor.get("Project").Name : ""),
                			ScheduleState: predecessor.get("ScheduleState"),
                			Iteration: iteration,
                			DueDate: predecessor.get("DueDate")
                        }
                        s.PredIterationSortNum = self._getSortableIteration(iteration)
                        storyDuplicationArray.push(s);
                    });
                    
                    var successorsArray = story.SuccessorsStore.getRange();
                    _.each(successorsArray, function(successor) {
                        var s = JSON.parse(JSON.stringify(stories.get(story.get("FormattedID"))));
                        var iteration = (successor.get("Iteration") ? successor.get("Iteration").Name : "");
                        s.Successor = { 
	            			_ref: successor.get("_ref"), 
	            			FormattedID: successor.get("FormattedID"), 
	            			Name: successor.get("Name"),
	            			Project: (successor.get("Project") ? successor.get("Project").Name : ""),
	            			ScheduleState: successor.get("ScheduleState"),
	            			Iteration: iteration
	            		};
	            		s.SuccIterationSortNum = self._getSortableIteration(iteration)
                        storyDuplicationArray.push(s);
                    });
             
                    if(storyDuplicationArray.length !== 0) {
                        stories.set(story.get("FormattedID"), storyDuplicationArray);
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
            var iterationStr = _iterationStr.replace("Sprint ", "");
            var iterationDecimal = iterationStr.split('.')[1].charCodeAt(0) - 64
            iterationStr = iterationStr.split('.')[0] + "." + iterationDecimal;
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
            proxy: {
                type:'memory'
            }
        });
        this._stories = stories;
        this._grid = Ext.create('Rally.ui.grid.Grid',{
            itemId: 'storiesGrid',
            store: store,
            showRowActionsColumn: false,
            showPagingToolbar: false,
            columnCfgs: [
            {
                text: "Predecessor ID", dataIndex: "Predecessor",
                renderer: function(value) {
                    return value.FormattedID;
                }
            }, {
                text: "Predecessor Name", dataIndex: "Predecessor",
                renderer: function(value) {
                    return value.Name;
                }
            }, {
                text: "Predecessor Project", dataIndex: "Predecessor",
                renderer: function(value) {
                    return value.Project;
                }
            }, {
                text: "Predecessor Schedule State", dataIndex: "Predecessor",
                renderer: function(value) {
                    return value.ScheduleState;
                }
            }, {
                text: "Predecessor Iteration", dataIndex: "Predecessor",
                getSortParam: function() {
            	    return "PredIterationSortNum";
                },
                renderer: function(value) {
                    return value.Iteration;
                }
            }, {
                text: "Predecessor Due Date", dataIndex: "Predecessor",
                renderer: function(value) {
                    return value.DueDate;
                }
            }, { 
            	text: "Story ID", dataIndex: "FormattedID", xtype: "templatecolumn",
            	tpl: Ext.create("Rally.ui.renderer.template.FormattedIDTemplate"),
            	getSortParam: function() {
            	    return "StoryNumericID";
                }
            }, { 
            	text: "Story Name", dataIndex: "Name", flex: 1
            }, { 
            	text: "Story Project", dataIndex: "Project"
            }, {
                text: "Story Schedule State", dataIndex: "StoryScheduleState"
            }, {
                text: "Story Iteration", dataIndex: "Iteration",
                getSortParam: function(value) {
            	    return "IterationSortNumber";
                }
            }, {
                text: "Story Due Date", dataIndex: "DueDate"
            }, {
                text: "Feature ID", dataIndex: "Feature", width: 65,
                getSortParam: function() {
                    return "FeatureNumericID";  
                },
                renderer: function(value) {
                    return value ? '<a href="' + Rally.nav.Manager.getDetailUrl(value) + '">' + value.FormattedID + "</a>" : void 0;
                }
            }, {
                text: "Feature Name", dataIndex: "FeatureName", flex: 1
            }, {
                text: "Successor ID", dataIndex: "Successor",
                renderer: function(value) {
                    // // console.log(value);
                    // var html = [];
                    // Ext.Array.each(value, function(successor) { 
                	   // html.push('<a href="' + Rally.nav.Manager.getDetailUrl(successor) + '">' + successor.FormattedID + "</a>");
                    // });
                    // return html.join("</br>");
                    return value.FormattedID;
                }
            }, {
                text: "Successor Name", dataIndex: "Successor",
                renderer: function(value) {
                    return value.Name;
                }
            }, {
                text: "Successor Project", dataIndex: "Successor",
                renderer: function(value) {
                    return value.Project
                }
            }, {
                text: "Successor Schedule State", dataIndex: "Successor",
                renderer: function(value) {
                    return value.ScheduleState;
                }
            }, {
                text: "Successor Iteration", dataIndex: "Successor",
                getSortParam: function() {
            	    return "SuccIterationSortNum";
                },
                renderer: function(value) {
                    return value.Iteration;
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
    },

    _onClickExport: function(){
        var data = this._getCSV();
        window.location = 'data:text/csv;charset=utf8,' + encodeURIComponent(data);
    },
    
    _getCSV: function () {
        
        var cols = this._grid.columns;
        var data = '';

        _.each(cols, function(col) {
            data += this._getFieldTextAndEscape(col.text) + ',';
        }, this);
        data += 'Milestones,';
        data += "\r\n";
        _.each(this._stories, function(record) {
            var featureData = record["Feature"];
            var storyData = '';
            _.each(cols, function(col) {
                var text = '';
                var fieldName = col.dataIndex;
                if (fieldName === "Feature" && featureData) {
                    text = featureData.FormattedID;
                } else if (fieldName === "TestCaseCount") {
                    text = record[fieldName].toString();
                } else if (fieldName === "TestCases"){
                    data += this._getTestCaseRowsForCSV(record[fieldName], storyData, record["TestCaseCount"], featureData);
                } else {
                    text = record[fieldName];
                }
                var cleanText = this._getFieldTextAndEscape(text);
                data +=  cleanText + ',';
                storyData += cleanText + ',';
            }, this);
            data += this._getMilestonesForCSV(featureData);
            data += "\r\n";
        }, this);

        return data;
    },
    _getMilestonesForCSV: function(feature) {
        var milestones = '';
        _.each(feature.Milestones._tagsNameArray, function(milestone) {
            milestones += this._getFieldTextAndEscape(milestone.Name) + ' ';
        }, this);
        return milestones;
    },
    _getTestCaseRowsForCSV: function(testcases, storyRowStr, testcaseCount, feature) {
        //In this app in Rally, stories with multiple testcases group all the testcases into one table cell
        //However, when exporting the data the requirement is for each 
        //testcase to get it's own table row in the CSV, with all the story data duplicated.

        var self = this;
        var testcaseRows = '';
        
        _.each(testcases, function(testcase, index) {
            if (index === 0) {
                testcaseRows += self._getFieldTextAndEscape(testcase.FormattedID);
            } else {
                testcaseRows += storyRowStr + self._getFieldTextAndEscape(testcase.FormattedID);
            }
            
            if(testcaseCount > 1 && index !== testcaseCount - 1 ) {
                testcaseRows += ',' + self._getMilestonesForCSV(feature) + "\r\n";
            }
        });
        
        return testcaseRows;
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
