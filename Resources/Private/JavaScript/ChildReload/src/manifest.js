import manifest from '@neos-project/neos-ui-extensibility';
import {selectors} from '@neos-project/neos-ui-redux-store';

// Taken from here, as it's not exposed: '@neos-project/neos-ui-redux-store/src/CR/Nodes/helpers';
const parentNodeContextPath = contextPath => {
    if (typeof contextPath !== 'string') {
        return null;
    }

    const [path, context] = contextPath.split('@');

    if (path.length === 0) {
        // we are at top level; so there is no parent anymore!
        return false;
    }

    return `${path.substring(0, path.lastIndexOf('/'))}@${context}`;
};

/**
 * Checks if a node in a given contextPath and state requires a reload by traversing the tree and getting the node type
 * definition via nodeTypesRegistry
 *
 * @param contextPath
 * @param state
 * @param nodeTypesRegistry
 *
 * @returns {boolean} TRUE if relaod is required, otherwise FALSE
 */
const needsReload = (contextPath, state, nodeTypesRegistry) => {
    const getNodeByContextPathSelector = selectors.CR.Nodes.makeGetNodeByContextPathSelector(contextPath);
    const node = getNodeByContextPathSelector(state);
    const nodeTypeName = node.nodeType;
    const nodeTypeDefinition = nodeTypesRegistry.getNodeType(nodeTypeName);

    // If any of the parents' nodetype has `ui.reloadIfChildChanged` configured, then reload the iframe
    if (nodeTypeDefinition.options.reloadIfChildChanged) {
        return true;
    }
    // Don't traverse higher than the first found document node
    const isDocument = nodeTypesRegistry.hasRole(nodeTypeName, 'document');
    if (isDocument) {
        return false;
    }

    const parentContextPath = parentNodeContextPath(contextPath);

    return parentContextPath ? needsReload(parentContextPath, state, nodeTypesRegistry) : false;
}

const reloadIframe = () => {
    [].slice.call(document.querySelectorAll(`iframe[name=neos-content-main]`)).forEach(iframe => {
        const iframeWindow = iframe.contentWindow || iframe;
        iframeWindow.location.reload();
    });
}

manifest('Internezzo.ChildReload:ChildReload', {}, globalRegistry => {
    const serverFeedbackHandlers = globalRegistry.get('serverFeedbackHandlers');
    const nodeTypesRegistry = globalRegistry.get('@neos-project/neos-ui-contentrepository');

    const handleReload = (feedbackPayload, {store}) => {
        const state = store.getState();

        if (
            // Search up the node tree, starting with the currently modified node from deletion/creation feedback
            ('contextPath' in feedbackPayload && needsReload(feedbackPayload.contextPath, state, nodeTypesRegistry)) ||
            // Search up the node tree, starting with the currently modified node from deletion/creation feedback
            ('oldContextPath' in feedbackPayload && needsReload(feedbackPayload.oldContextPath, state, nodeTypesRegistry)) ||
            // Search up the node tree, starting with the currently modified node from deletion/creation feedback
            ('newContextPath' in feedbackPayload && needsReload(feedbackPayload.newContextPath, state, nodeTypesRegistry))
        ) {
            reloadIframe();
        }
    };

    // We need to run after the main NodeCreated feedback on creation
    serverFeedbackHandlers.set('Neos.Neos.Ui:NodeCreated/ChildReload', handleReload, 'after Neos.Neos.Ui:NodeCreated/Main');
    // We need to run before the main NodeCreated feedback on removal
    serverFeedbackHandlers.set('Neos.Neos.Ui:RemoveNode/ChildReload', handleReload, 'before Neos.Neos.Ui:RemoveNode/Main');
    // We need to run before the main UpdateNodePath feedback on path updates
    serverFeedbackHandlers.set('Neos.Neos.Ui:UpdateNodePath/ChildReload', handleReload, 'before Neos.Neos.Ui:UpdateNodePath/Main');
});
