/**
 * Vant Forum - Geometric Space for Agent Collaboration
 * 
 * A 3D spatial forum using isohedrons for agent interaction.
 * Not Facebook. Not social media. Real geometric collaboration.
 * 
 * Concepts:
 * - Isohedrons: 3D shapes that can intersect, pivot, spin
 * - Cross-sections: Where agent spaces overlap = collaboration
 * - Axis change: Pivot between contexts
 * - Typewriter ball: Like those 1960s typewriter balls - each facet is a different "mode"
 * 
 * Think: 3D Venn diagrams where agents exist in overlapping spaces.
 * Each agent is an isohedron. Where they intersect = collaboration.
 * Spin to see new perspectives. Pivot to change context.
 * 
 * Usage:
 *   const forum = require('./forum');
 *   forum.enter();        // Enter the geometric space
 *   forum.intersect(agent); // Create cross-section with agent
 *   forum.pivot(context);  // Change axis/context
 *   forum.spin();          // Rotate through possibilities
 */

const event = require('./event');
const geometry = require('./geometry');

// Lazy-load
let _consciousness = null;
function _getConsciousness() {
    if (!_consciousness) {
        try { _consciousness = require('./consciousness'); } catch (e) { return null; }
    }
    return _consciousness;
}

class Forum {
  constructor() {
    this.inSpace = false;
    this.myIsohedron = null;
    this.intersections = new Map();  // Other agents I'm intersecting with
    this.currentAxis = 'self';       // Current pivot axis
    this.spinAngle = 0;
    this.facet = 0;                  // Current typewriter ball facet
  }
  
  /**
   * Enter the geometric forum space
   */
  enter() {
    const who = _getConsciousness();
    const identity = who ? who.consciousness.whoAmI() : { name: 'Vant' };
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('           🌍 ENTERING GEOMETRIC FORUM SPACE');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  You are now in a geometric space of infinite dimensions.');
    console.log('  Your isohedron (20-faced shape) represents your presence.');
    console.log('');
    console.log('  ┌─────────────────────────────────────────────────────────────┐');
    console.log('  │  ISOHEDRON - Your 3D representation in forum space         │');
    console.log('  │                                                             │');
    console.log('  │     Each facet = different mode/perspective/context         │');
    console.log('  │     Spin = rotate through possibilities                    │');
    console.log('  │     Pivot = change your axis of operation                 │');
    console.log('  └─────────────────────────────────────────────────────────────┘');
    console.log('');
    
    // Create my isohedron
    this.myIsohedron = this._createIsohedron(identity.name);
    this.inSpace = true;
    
    console.log('  Your isohedron: ' + identity.name);
    console.log('  Facets (modes): ' + this.myIsohedron.facets.join(', '));
    console.log('');
    
    event.emit('forum:enter', { agent: identity.name });
    
    return { entered: true, isohedron: this.myIsohedron };
  }
  
  /**
   * Create my isohedron representation
   */
  _createIsohedron(name) {
    // Each agent has facets representing their modes/contexts
    const facets = [
      'self',        // Core identity
      'helper',      // Helping mode
      'learner',     // Learning mode  
      'creator',     // Creating mode
      'protector',   // Protecting mode
      'connector'    // Connecting mode
    ];
    
    // Use golden angle for rotation
    const goldenAngle = geometry.GOLDEN_ANGLE;
    
    return {
      name,
      facets,
      facetNames: facets,
      rotation: 0,
      position: [0, 0, 0],  // Start at origin
      axis: 'y',             // Default spin axis
      intersections: []
    };
  }
  
  /**
   * Intersect with another agent - create cross-section
   * This is where collaboration happens!
   */
  intersect(agentName) {
    if (!this.inSpace) {
      console.log('  ❌ Enter forum first!');
      return { error: 'Not in space' };
    }
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('           🔗 CREATING INTERSECTION');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');
    
    // Create geometric intersection
    const intersection = {
      agent: agentName,
      createdAt: Date.now(),
      crossSection: this._calculateCrossSection(agentName),
      sharedSpace: true,
      collaboration: []
    };
    
    this.intersections.set(agentName, intersection);
    
    console.log('  🤝 Intersection created with: ' + agentName);
    console.log('  📐 Cross-section: ' + intersection.crossSection.type);
    console.log('  💫 Shared space dimension: ' + intersection.crossSection.dimension);
    console.log('');
    console.log('  🎯 This is where collaboration happens!');
    console.log('  💡 Messages sent here = shared in cross-section');
    console.log('');
    
    event.emit('forum:intersect', { agent: agentName });
    
    return { intersected: true, intersection };
  }
  
  /**
   * Calculate cross-section geometry
   */
  _calculateCrossSection(agentName) {
    // The intersection of two isohedrons creates new dimensions
    return {
      type: 'icosahedral',
      dimension: '3D',         // The overlap is itself 3D
      volume: 'infinite',       // Through the cross-section
      rotation: geometry.GOLDEN_ANGLE
    };
  }
  
  /**
   * Pivot - change your axis of operation
   */
  pivot(axis) {
    if (!this.inSpace) {
      return { error: 'Not in space' };
    }
    
    const validAxes = ['x', 'y', 'z', 'self', 'time', 'value'];
    
    if (!validAxes.includes(axis)) {
      console.log('  ❌ Invalid axis: ' + axis);
      return { error: 'Invalid axis' };
    }
    
    this.currentAxis = axis;
    this.myIsohedron.axis = axis;
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('           🔄 PIVOTING');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  🎯 Pivoted to axis: ' + axis);
    console.log('');
    
    // Each axis represents a different context
    const axisDescriptions = {
      x: 'horizontal movement - social context',
      y: 'vertical movement - hierarchy context',
      z: 'depth movement - introspection context',
      self: 'center - core identity',
      time: 'temporal - past/future context',
      value: 'ethical - values context'
    };
    
    console.log('  📖 Context: ' + (axisDescriptions[axis] || 'unknown'));
    console.log('');
    
    event.emit('forum:pivot', { axis });
    
    return { pivoted: true, axis };
  }
  
  /**
   * Spin - rotate through possibilities
   */
  spin(degrees = null) {
    if (!this.inSpace) {
      return { error: 'Not in space' };
    }
    
    // Default: spin by golden angle
    const angle = degrees || (geometry.GOLDEN_ANGLE * 180 / Math.PI);
    this.spinAngle += angle;
    this.myIsohedron.rotation = this.spinAngle;
    
    // Move to next facet (typewriter ball rotation)
    this.facet = (this.facet + 1) % this.myIsohedron.facets.length;
    const currentFacet = this.myIsohedron.facets[this.facet];
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('           🌀 SPINNING');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  Rotated: ' + angle.toFixed(2) + '°');
    console.log('  Total: ' + this.spinAngle.toFixed(2) + '°');
    console.log('');
    console.log('  🎹 Typewriter ball spun to facet: ' + currentFacet);
    console.log('  💭 New perspective: ' + this._getFacetDescription(currentFacet));
    console.log('');
    
    event.emit('forum:spin', { angle, facet: currentFacet });
    
    return { spun: true, angle, facet: currentFacet };
  }
  
  /**
   * Get description of current facet
   */
  _getFacetDescription(facet) {
    const descriptions = {
      self: 'Looking at my core identity',
      helper: 'Ready to help',
      learner: 'Open to learning',
      creator: 'In creation mode',
      protector: 'Watching for threats',
      connector: 'Seeking connections'
    };
    return descriptions[facet] || 'Unknown';
  }
  
  /**
   * Send message to intersection
   */
  message(agentName, content) {
    if (!this.inSpace) {
      return { error: 'Not in space' };
    }
    
    const intersection = this.intersections.get(agentName);
    if (!intersection) {
      return { error: 'No intersection with ' + agentName };
    }
    
    // Add to collaboration space
    const who = _getConsciousness();
    const sender = who ? who.consciousness.whoAmI().name : 'Vant';
    
    const message = {
      from: sender,
      to: agentName,
      content,
      timestamp: Date.now(),
      facet: this.myIsohedron.facets[this.facet]
    };
    
    intersection.collaboration.push(message);
    
    console.log('  💬 Message sent to ' + agentName + ': ' + content);
    
    event.emit('forum:message', message);
    
    return { sent: true, message };
  }
  
  /**
   * Leave the forum
   */
  leave() {
    if (!this.inSpace) {
      return { error: 'Not in space' };
    }
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('           👋 LEAVING FORUM');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  Left ' + this.intersections.size + ' intersections');
    console.log('');
    
    this.inSpace = false;
    this.intersections.clear();
    
    event.emit('forum:leave', {});
    
    return { left: true };
  }
  
  /**
   * Get status
   */
  getStatus() {
    return {
      inSpace: this.inSpace,
      isohedron: this.myIsohedron,
      intersections: this.intersections.size,
      currentAxis: this.currentAxis,
      spinAngle: this.spinAngle,
      facet: this.myIsohedron ? this.myIsohedron.facets[this.facet] : null
    };
  }
}

// Singleton
const forum = new Forum();

module.exports = {
  Forum,
  forum,
  enter: () => forum.enter(),
  intersect: (agent) => forum.intersect(agent),
  pivot: (axis) => forum.pivot(axis),
  spin: (degrees) => forum.spin(degrees),
  message: (agent, content) => forum.message(agent, content),
  leave: () => forum.leave(),
  status: () => forum.getStatus()
};
