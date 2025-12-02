import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { IDisposable, DisposableDelegate } from '@lumino/disposable';
import { ToolbarButton } from '@jupyterlab/apputils';
import { ICellModel, CodeCellModel, CodeCell } from '@jupyterlab/cells';
import { IObservableList } from '@jupyterlab/observables';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { NotebookPanel, INotebookModel, Notebook, CellList, NotebookActions } from '@jupyterlab/notebook';
import { each } from '@lumino/algorithm';


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
    private notebook!: Notebook;
    private isEnabled: boolean = true;
    private scrollInterval: number | null = null;
    private lastScrollHeights: Map<CodeCell, number> = new Map();
    private executingCells: Set<CodeCellModel> = new Set();

    init(panel: NotebookPanel): IDisposable {

        const triggerAutoScrollCellOutput = () => {
            if (this.isEnabled) {
                this.isEnabled = false;
                console.log('Extension jupyterlab_autoscrollcelloutput disabled for notebook:', panel.id);
            }
            else {
                this.isEnabled = true;
                console.log('Extension jupyterlab_autoscrollcelloutput enabled for notebook:', panel.id);
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

        // Attach handlers to all existing cells
        for (let cell of this.notebook.model!.cells) {
            if (cell instanceof CodeCellModel) {
                this.attachOutputHandler(cell);
            }
        }

        // Listen for new cells being added
        this.notebook.model!.cells.changed.connect(this.handlerCellsChange, this);

        // Listen for cell execution start - track which cells are executing
        NotebookActions.executionScheduled.connect((_, args: any) => {
            const cellModel = args.cell.model as CodeCellModel;
            this.executingCells.add(cellModel);
            //console.log("Cell execution scheduled, executingCells count:", this.executingCells.size);
            if (this.notebook.model!.getMetadata('autoscrollcelloutput')) {
                this.startScrollInterval();
            }
        });

        // Listen for cell execution completion - remove from tracking
        NotebookActions.executed.connect((_, args: any) => {
            const cellModel = args.cell.model as CodeCellModel;
            this.executingCells.delete(cellModel);
            //console.log("Cell execution finished, executingCells count:", this.executingCells.size);
            // Stop scrolling if no more cells are executing
            if (this.executingCells.size === 0) {
                //console.log("All cells done executing, stopping scroll interval");
                this.stopScrollInterval();
            }
        });

        return new DisposableDelegate(() => { button.dispose(); });
    }
 
    private handlerCellsChange(
        cells: CellList,
        changed_cells: IObservableList.IChangedArgs<ICellModel>): void 
    {
        //console.log("changed_cells !");
        if (changed_cells.type == 'add') {
            //console.log("added_cells !");
            each(changed_cells.newValues, (cellModel, idx) => {
                //console.log("new_values !");
                if (cellModel instanceof CodeCellModel) {
                    //console.log("code_cell_model !");
                    this.attachOutputHandler(cellModel);
                }
            });
        }
    }

    private attachOutputHandler(cellModel: CodeCellModel): void {
        // Listen for ANY output list changes - this covers add, remove, clear, and content updates
        cellModel.outputs.changed.connect((output, arg) => {
            //console.log("output_list_changed !", arg.type);
            let autoScrollSet = this.notebook.model!.getMetadata('autoscrollcelloutput');
            if (autoScrollSet) {
                //console.log("scrolling_to_bottom !");
                this.startScrollInterval();
            }
        });
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

    private checkAndScroll(): void {
        //console.log("checkAndScroll called");
        let autoScrollSet = this.notebook.model!.getMetadata('autoscrollcelloutput');
        if (!autoScrollSet) {
            this.stopScrollInterval();
            return;
        }

        // Check each cell for height changes
        for (let cell of this.notebook.widgets) {
            if (cell instanceof CodeCell) {
                const outputArea = cell.outputArea;
                const currentHeight = outputArea.node.scrollHeight;
                const lastHeight = this.lastScrollHeights.get(cell) || 0;

                // If height has changed, scroll
                if (currentHeight !== lastHeight) {
                    //console.log("Height changed for cell:", currentHeight, "vs", lastHeight);
                    outputArea.node.scrollTop = currentHeight;
                    this.lastScrollHeights.set(cell, currentHeight);
                }
            }
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