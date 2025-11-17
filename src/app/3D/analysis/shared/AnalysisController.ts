import * as THREE from 'three';

/**
 * Centralized controller for all analysis tool groups
 * Manages a single AnalysisRoot group under tileGroup with child groups per tool
 */
function createAnalysisController() {
    let rootGroup: THREE.Group | null = null;
    const toolGroups = new Map<string, THREE.Group>();

    function ensureAttached(tileGroup: THREE.Group | null | undefined) {
        if (!tileGroup) return;
        if (!rootGroup) {
            rootGroup = new THREE.Group();
            rootGroup.name = 'AnalysisRoot';
        }
        if (!rootGroup.parent) {
            tileGroup.add(rootGroup);
        }
    }

    function getToolGroup(name: string): THREE.Group {
        let g = toolGroups.get(name);
        if (!g) {
            g = new THREE.Group();
            g.name = `${name}Group`;
            if (rootGroup) rootGroup.add(g);
            toolGroups.set(name, g);
        }
        return g;
    }

    function removeToolGroup(name: string, dispose: boolean = true) {
        const g = toolGroups.get(name);
        if (!g) return;
        if (dispose) {
            g.traverse(obj => {
                const anyObj = obj as any;
                if (anyObj.geometry && typeof anyObj.geometry.dispose === 'function') {
                    anyObj.geometry.dispose();
                }
                if (anyObj.material) {
                    if (Array.isArray(anyObj.material)) {
                        anyObj.material.forEach((m: any) => m && typeof m.dispose === 'function' && m.dispose());
                    } else if (typeof anyObj.material.dispose === 'function') {
                        anyObj.material.dispose();
                    }
                }
            });
        }
        if (g.parent) g.parent.remove(g);
        toolGroups.delete(name);
    }

    function clearAll(dispose: boolean = true) {
        for (const key of Array.from(toolGroups.keys())) {
            removeToolGroup(key, dispose);
        }
        if (rootGroup && rootGroup.parent) {
            rootGroup.parent.remove(rootGroup);
        }
        rootGroup = null;
    }

    return {
        ensureAttached,
        getToolGroup,
        removeToolGroup,
        clearAll,
    };
}

export const globalAnalysisController = createAnalysisController();
