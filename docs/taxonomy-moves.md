# Move classes in the taxonomy

Drag a class onto another class in Hierarchy to make the target its parent. The move replaces the rdfs:subClassOf assertion for the branch being dragged. Other parents, child classes, instances, annotations and OWL definitions remain intact. One Undo reverses the move; Redo reapplies it.

For a branch derived from an equivalent-class definition, the drop adds an explicit rdfs:subClassOf assertion. It does not rewrite the definition. Classes with multiple parents appear beneath their first visible asserted parent; the drop target becomes that parent. The same ordering is used by the stylesheet hierarchy.

Hovering over a collapsed target expands it. Holding near the tree's top or bottom scrolls the taxonomy. A highlighted target and short status identify the destination. Dropping on empty tree space moves the class under owl:Thing. Self-parenting, descendant cycles and moving owl:Thing are blocked. A changed ontology invalidates an in-progress drag.

The updated relationships appear in Details, Source and graph views and are included in normal workspace saving and autosave. Dragging a node from Hierarchy into Details continues to open it without changing its parent.
