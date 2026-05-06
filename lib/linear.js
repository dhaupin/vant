/**
 * Linear Integration
 * 
 * GraphQL API for issue tracking, comments, and project management
 */

const logger = require('./logger');
const config = require('./config');

const LINEAR_API_KEY = process.env.LINEAR_API_KEY;
const LINEAR_TEAM = process.env.LINEAR_TEAM;
const LINEAR_ENDPOINT = process.env.LINEAR_ENDPOINT || 'https://api.linear.app/graphql';

/**
 * Execute GraphQL query
 */
async function query(query, variables = {}) {
    if (!LINEAR_API_KEY) {
        logger.warn('[Linear] No LINEAR_API_KEY configured');
        return null;
    }
    
    try {
        const response = await fetch(LINEAR_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': LINEAR_API_KEY
            },
            body: JSON.stringify({ query, variables })
        });
        
        const json = await response.json();
        
        if (json.errors) {
            logger.error(`[Linear] GraphQL error: ${json.errors[0].message}`);
            return null;
        }
        
        return json.data;
    } catch (e) {
        logger.error(`[Linear] Request error: ${e.message}`);
        return null;
    }
}

/**
 * List issues
 */
async function listIssues(filter = {}) {
    const gql = `
        query Issues($filter: IssueFilter) {
            issues(filter: $filter, first: 25) {
                nodes {
                    id
                    title
                    description
                    state { name }
                    priority
                    labels { nodes { name } }
                    assignee { name }
                    createdAt
                }
            }
        }
    `;
    
    return await query(gql, { filter });
}

/**
 * Create issue
 */
async function createIssue(title, options = {}) {
    const gql = `
        mutation CreateIssue($input: IssueInput!) {
            issueCreate(input: $input) {
                success
                issue { id title }
            }
        }
    `;
    
    const input = {
        title,
        description: options.description,
        priority: options.priority || 2,
        teamId: options.teamId || LINEAR_TEAM,
        projectId: options.projectId
    };
    
    return await query(gql, { input });
}

/**
 * Add comment
 */
async function addComment(issueId, body) {
    const gql = `
        mutation AddComment($issueId: String!, $body: String!) {
            commentCreate(input: { issueId: $issueId, body: $body }) {
                success
                comment { id body }
            }
        }
    `;
    
    return await query(gql, { issueId, body });
}

/**
 * Update issue
 */
async function updateIssue(issueId, updates) {
    const gql = `
        mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
            issueUpdate(id: $id, input: $input) {
                success
            }
        }
    `;
    
    return await query(gql, { id: issueId, input: updates });
}

/**
 * List labels
 */
async function listLabels() {
    const gql = `
        query Labels {
            labels(first: 50) {
                nodes { id name color }
            }
        }
    `;
    
    return await query(gql);
}

/**
 * Get issue by ID
 */
async function getIssue(issueId) {
    const gql = `
        query Issue($id: String!) {
            issue(id: $id) {
                id
                title
                description
                state { name }
                priority
                labels { nodes { name } }
                assignee { name }
                createdAt
                updatedAt
            }
        }
    `;
    
    return await query(gql, { id: issueId });
}

module.exports = {
    query,
    listIssues,
    createIssue,
    addComment,
    updateIssue,
    listLabels,
    getIssue
};