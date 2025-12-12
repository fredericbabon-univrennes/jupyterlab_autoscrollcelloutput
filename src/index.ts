import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { IDisposable, DisposableDelegate } from '@lumino/disposable';
import { ToolbarButton } from '@jupyterlab/apputils';
import { CodeCell } from '@jupyterlab/cells';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { NotebookPanel, INotebookModel, Notebook } from '@jupyterlab/notebook';

const plugin: JupyterFrontEndPlugin<void> = {
    id: 'jupyterlab_autoscrollcelloutput:plugin',
    autoStart: true,
    activate: (app: JupyterFrontEnd) => {
        console.log('JupyterLab extension jupyterlab_autoscrollcelloutput is activated!');
        app.docRegistry.addWidgetExtension('Notebook', {
            createNew: (panel: NotebookPanel, context: DocumentRegistry.IContext<INotebookModel>): IDisposable => {
                return new ButtonAutoScrollCellOutput().init(panel);
            }
        });
    }
};

class ButtonAutoScrollCellOutput {
    private notebookPanelId: string="";
    private notebook!: Notebook;
    private isEnabled: boolean = true;
    private scrollInterval: number | null = null;
    private lastScrollHeights: Map<string, number> = new Map();    
    private monitoredCells: Map<string, CodeCell> = new Map();
    private runningCellIds: Set<string> = new Set();

    init(panel: NotebookPanel): IDisposable {
        this.notebookPanelId = panel.id;
        //console.log("init with panel :", this.notebookPanelId);        
        
        const triggerAutoScrollCellOutput = () => {
            if (this.isEnabled) {
                this.isEnabled = false;
                console.log('Extension jupyterlab_autoscrollcelloutput disabled for notebook:', this.notebookPanelId);
            }
            else {
                this.isEnabled = true;
                console.log('Extension jupyterlab_autoscrollcelloutput enabled for notebook:', this.notebookPanelId);
            }
            button.pressed = this.isEnabled;
            this.notebook.model!.setMetadata('autoscrollcelloutput', this.isEnabled);
        };

        const button = new ToolbarButton({
            className: 'buttonAutoScrollCellOutput',
            iconClass: 'wll-ScrollIcon',
            label: 'scroll',
            onClick: triggerAutoScrollCellOutput,
            tooltip: 'Auto Scroll Cell Output'
        })

        panel.toolbar.insertItem(10, 'AutoScrollCellOutput', button);
        this.notebook = panel.content;
        button.pressed = true;

        // Listen for active cell has changed
        this.notebook.activeCellChanged.connect(this.handlerActiveCellChanged, this);       

        return new DisposableDelegate(() => { button.dispose(); });
    }

    private handlerActiveCellChanged(
        notebook: any,
        activecell: any)
    {
        //console.log("Panel:",this.notebookPanelId,"handlerActiveCellChanged, activecell:",activecell);
        if(activecell!=null)
        {
            //console.log("Panel:",this.notebookPanelId,"handlerActiveCellChanged, activecell:",activecell.model.id);
            if (activecell instanceof CodeCell && !this.monitoredCells.has(activecell.model.id)) {
                //console.log("Panel:",this.notebookPanelId,"handlerActiveCellChanged, adding cell monitored:",activecell.model.id);
                this.monitoredCells.set(activecell.model.id, activecell);
                activecell.model.stateChanged.connect(this.handlerCellStateChanged, this);
            }
        }
        let cell_model_ids_to_remove = new Array();
        for (let [cell_model_id, cell] of this.monitoredCells)
        {
            if(activecell == null || (activecell.model.id!=cell_model_id))
            {
                if(cell.model.executionState=="idle")
                {
                    //console.log("Panel:",this.notebookPanelId,"handlerActiveCellChanged, cell no more active and idle, so removed:",cell_model_id);
                    this.removeRunningCell(cell_model_id);                    
                    cell_model_ids_to_remove.push(cell_model_id);
                    cell.model.stateChanged.disconnect(this.handlerCellStateChanged, this);
                }
                else
                {
                    //console.log("Panel:",this.notebookPanelId,"handlerActiveCellChanged, cell no more active but not idle:",cell_model_id);
                }
            }
        }

        for (let cell_model_id_to_remove of cell_model_ids_to_remove)
        {
            //console.log("Panel:",this.notebookPanelId,"handlerActiveCellChanged, removing cell monitored:",cell_model_id_to_remove);
            this.monitoredCells.delete(cell_model_id_to_remove);            
        }
        
    }

    private removeRunningCell(cell_model_id:string)
    {
        let cell = this.monitoredCells.get(cell_model_id);
        if(cell != undefined)
        {
            let was_deleted = this.runningCellIds.delete(cell_model_id);                
            //console.log("cell removed from running :",cell_model_id," was_deleted=",was_deleted);
            if(was_deleted)
                this.scrollCell(cell);
        }
    }
    
    private handlerCellStateChanged(
      cellModel: any,
      changedArgs: any)
    {
        //console.log("Panel:",this.notebookPanelId,"handlerCellStateChanged, cell:",cellModel.id);
        //console.log("Panel:",this.notebookPanelId,"changedArgs.name=",changedArgs.name);
        //console.log("Panel:",this.notebookPanelId,"changedArgs.oldValue=",changedArgs.oldValue);
        //console.log("Panel:",this.notebookPanelId,"changedArgs.newValue=",changedArgs.newValue);
        if(changedArgs.name=="executionState")
        {
            if(changedArgs.newValue=="running")
            {
                //console.log("cell added to running :",cellModel.id);
                this.runningCellIds.add(cellModel.id);
                if(this.runningCellIds.size==1)
                {
                    this.startScrollInterval();
                }
            }
            else if(changedArgs.newValue=="idle")
            {
                //console.log("idle!");
                this.removeRunningCell(cellModel.id);                
                
                if(this.notebook.activeCell == null || this.notebook.activeCell.model.id != cellModel.id)
                {
                    //console.log("Panel:",this.notebookPanelId,"handlerCellStateChanged, cell no more active and idle, so removed:",cellModel.id);                    
                    cellModel.stateChanged.disconnect(this.handlerCellStateChanged, this);
                    this.monitoredCells.delete(cellModel.id);   
                }
            }
        }
    }
    
    private startScrollInterval(): void {
        // Start interval if not already running
        if (this.scrollInterval === null) {
            //console.log("Starting scroll interval");
            this.scrollInterval = window.setInterval(() => {
                this.checkAndScroll();
            }, 1000); // Check every 1 second
        }
    }

    private scrollCell(cell:any): void{
        if (cell != null && cell instanceof CodeCell) {
                //console.log("trying to scroll cell id :",cell.model.id);
                const outputArea = cell.outputArea;
                const currentHeight = outputArea.node.scrollHeight;
                const lastHeight = this.lastScrollHeights.get(cell.model.id) || 0;

                // If height has changed, scroll
                if (currentHeight !== lastHeight) {
                    //console.log("Height changed for cell:", currentHeight, "vs", lastHeight);
                    outputArea.node.scrollTop = currentHeight;
                    this.lastScrollHeights.set(cell.model.id, currentHeight);
                }
                
            }
    }
    
    private checkAndScroll(): void {
        //console.log("checkAndScroll called");
        let autoScrollSet = false;
        if(this.notebook.model != null)        
            autoScrollSet = this.notebook.model!.getMetadata('autoscrollcelloutput');
        if (!autoScrollSet || this.runningCellIds.size==0) {
            this.stopScrollInterval();
            return;
        }

        // Scroll each running cell 
        for (let cellid of this.runningCellIds) {
            let cell = this.monitoredCells.get(cellid);
            this.scrollCell(cell);
        }
    }

    private stopScrollInterval(): void {        
        if (this.scrollInterval !== null) {
            //console.log("Stopping scroll interval");
            clearInterval(this.scrollInterval);
            this.scrollInterval = null;
            this.lastScrollHeights.clear();
        }
    }
}

export default plugin;