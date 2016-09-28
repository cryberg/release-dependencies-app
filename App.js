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
            itemId: 'milestoneCombobox',
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
        
        this.down('#milestoneCombobox').add({
            xtype: 'rallymilestonecombobox',
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
            property: 'FeatureMilestones',
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
        var stories = [],
            pendingPredecessors= data.length,
            pendingSuccessors = data.length;
        _.each(data, function(story) {
            var s = { 
            	Feature: story.get("Feature"), 
            	FormattedID: story.get("FormattedID"), 
            	StoryNumericID: Number(story.get("FormattedID").replace(/\D+/g, '')),
            	Name: story.get("Name"), 
            	Project: (story.get("Project") ? story.get("Project").Name : ""),
            	Release: (story.get("Release") ? story.get("Release").Name : ""),
            	_ref: story.get("_ref"), 
            	Predecessors: [],
            	Successors: [],
            	StoryScheduleState: story.get("ScheduleState"),
            	Iteration: (story.get("Iteration") ? story.get("Iteration").Name : ""),
    			DueDate: story.get("DueDate")
            };
            
            if (s.Feature) {
                s.FeatureName = s.Feature.Name;

                //s.FeatureNumericID is an integer, so that the Feature ID sort will compare numbers instead of strings
                s.FeatureNumericID = Number(s.Feature.FormattedID.replace(/\D+/g, ''));
            }
            
            var predecessors = story.getCollection("Predecessors", { fetch: ["FormattedID", "Name", "Project", "ScheduleState", "Iteration", "DueDate"] });
            predecessors.load({ 
            	callback: function(records) { 
	            	_.each(records, function(predecessor) { 
	            		s.Predecessors.push({ 
	            			_ref: predecessor.get("_ref"), 
	            			FormattedID: predecessor.get("FormattedID"), 
	            			Name: predecessor.get("Name"),
	            			Project: (predecessor.get("Project") ? predecessor.get("Project").Name : ""),
	            			ScheduleState: predecessor.get("ScheduleState"),
	            			Iteration: (predecessor.get("Iteration") ? predecessor.get("Iteration").Name : ""),
	            			DueDate: predecessor.get("DueDate")
	            		});
	            		
	            		//console.log(s.Predecessors);
	            	}, this);

	            	--pendingPredecessors;

                    if (pendingPredecessors === 0) {
                        // this._makeGrid(stories);
                        // console.log('Predecessors end');
                    }
                },
                scope: this
            });
            
            var successors = story.getCollection("Successors", { fetch: ["FormattedID", "Name", "Project", "ScheduleState", "Iteration", "DueDate"] });
            successors.load({ 
            	callback: function(records) { 
	            	_.each(records, function(successor) { 
	            		s.Successors.push({ 
	            			_ref: successor.get("_ref"), 
	            			FormattedID: successor.get("FormattedID"), 
	            			Name: successor.get("Name"),
	            			Project: (successor.get("Project") ? successor.get("Project").Name : ""),
	            			ScheduleState: successor.get("ScheduleState"),
	            			Iteration: (successor.get("Iteration") ? successor.get("Iteration").Name : "")
	            		});
	            		
	           // 		console.log(s.Successors);
	            		
	            	}, this);

	            	--pendingSuccessors;
	           // 	console.log(s.Successors);

                    if (pendingSuccessors === 0) {
                        this._makeGrid(stories);
                    }
                },
                scope: this
            });

            stories.push(s);
            
        }, this);
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
                text: "Predecessor ID", dataIndex: "Predecessors",
                renderer: function(value) {
                    if(value[0]) { return value[0].FormattedID; }
                }
            }, {
                text: "Predecessor Name", dataIndex: "Predecessors",
                renderer: function(value) {
                    if(value[0]) { return value[0].Name; }
                }
            }, {
                text: "Predecessor Project", dataIndex: "Predecessors",
                renderer: function(value) {
                    if(value[0]) { return value[0].Project; }
                }
            }, {
                text: "Predecessor Schedule State", dataIndex: "Predecessors",
                renderer: function(value) {
                    if(value[0]) { return value[0].ScheduleState; }
                }
            }, {
                text: "Predecessor Iteration", dataIndex: "Predecessors",
                renderer: function(value) {
                    if(value[0]) { return value[0].Iteration; }
                }
            }, {
                text: "Predecessor Due Date", dataIndex: "Predecessors",
                renderer: function(value) {
                    if(value[0]) { return value[0].DueDate; }
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
                text: "Story Iteration", dataIndex: "Iteration"
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
                text: "Successor ID", dataIndex: "Successors",
                renderer: function(value) {
                    // // console.log(value);
                    // var html = [];
                    // Ext.Array.each(value, function(successor) { 
                	   // html.push('<a href="' + Rally.nav.Manager.getDetailUrl(successor) + '">' + successor.FormattedID + "</a>");
                    // });
                    // return html.join("</br>");
                    if(value[0]){ return value[0].FormattedID; }
                }
            }, {
                text: "Successor Name", dataIndex: "Successors",
                renderer: function(value) {
                    if(value[0]) { return value[0].Name; }
                }
            }, {
                text: "Successor Project", dataIndex: "Successors",
                renderer: function(value) {
                    if(value[0]) { return value[0].Project;}
                }
            }, {
                text: "Successor Schedule State", dataIndex: "Successors",
                renderer: function(value) {
                    if(value[0]) { return value[0].ScheduleState; }
                }
            }, {
                text: "Successor Iteration", dataIndex: "Successors",
                renderer: function(value) {
                    if(value[0]) { return value[0].Iteration; }
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
