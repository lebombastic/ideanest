// New Block - Updated March 19, 2025
function noop() { }
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}

// Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
// at the end of hydration without touching the remaining nodes.
let is_hydrating = false;
function start_hydrating() {
    is_hydrating = true;
}
function end_hydrating() {
    is_hydrating = false;
}
function upper_bound(low, high, key, value) {
    // Return first index of value larger than input value in the range [low, high)
    while (low < high) {
        const mid = low + ((high - low) >> 1);
        if (key(mid) <= value) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
}
function init_hydrate(target) {
    if (target.hydrate_init)
        return;
    target.hydrate_init = true;
    // We know that all children have claim_order values since the unclaimed have been detached if target is not <head>
    let children = target.childNodes;
    // If target is <head>, there may be children without claim_order
    if (target.nodeName === 'HEAD') {
        const myChildren = [];
        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            if (node.claim_order !== undefined) {
                myChildren.push(node);
            }
        }
        children = myChildren;
    }
    /*
    * Reorder claimed children optimally.
    * We can reorder claimed children optimally by finding the longest subsequence of
    * nodes that are already claimed in order and only moving the rest. The longest
    * subsequence of nodes that are claimed in order can be found by
    * computing the longest increasing subsequence of .claim_order values.
    *
    * This algorithm is optimal in generating the least amount of reorder operations
    * possible.
    *
    * Proof:
    * We know that, given a set of reordering operations, the nodes that do not move
    * always form an increasing subsequence, since they do not move among each other
    * meaning that they must be already ordered among each other. Thus, the maximal
    * set of nodes that do not move form a longest increasing subsequence.
    */
    // Compute longest increasing subsequence
    // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
    const m = new Int32Array(children.length + 1);
    // Predecessor indices + 1
    const p = new Int32Array(children.length);
    m[0] = -1;
    let longest = 0;
    for (let i = 0; i < children.length; i++) {
        const current = children[i].claim_order;
        // Find the largest subsequence length such that it ends in a value less than our current value
        // upper_bound returns first greater value, so we subtract one
        // with fast path for when we are on the current longest subsequence
        const seqLen = ((longest > 0 && children[m[longest]].claim_order <= current) ? longest + 1 : upper_bound(1, longest, idx => children[m[idx]].claim_order, current)) - 1;
        p[i] = m[seqLen] + 1;
        const newLen = seqLen + 1;
        // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
        m[newLen] = i;
        longest = Math.max(newLen, longest);
    }
    // The longest increasing subsequence of nodes (initially reversed)
    const lis = [];
    // The rest of the nodes, nodes that will be moved
    const toMove = [];
    let last = children.length - 1;
    for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
        lis.push(children[cur - 1]);
        for (; last >= cur; last--) {
            toMove.push(children[last]);
        }
        last--;
    }
    for (; last >= 0; last--) {
        toMove.push(children[last]);
    }
    lis.reverse();
    // We sort the nodes being moved to guarantee that their insertion order matches the claim order
    toMove.sort((a, b) => a.claim_order - b.claim_order);
    // Finally, we move the nodes
    for (let i = 0, j = 0; i < toMove.length; i++) {
        while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
            j++;
        }
        const anchor = j < lis.length ? lis[j] : null;
        target.insertBefore(toMove[i], anchor);
    }
}
function append_hydration(target, node) {
    if (is_hydrating) {
        init_hydrate(target);
        if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentNode !== target))) {
            target.actual_end_child = target.firstChild;
        }
        // Skip nodes of undefined ordering
        while ((target.actual_end_child !== null) && (target.actual_end_child.claim_order === undefined)) {
            target.actual_end_child = target.actual_end_child.nextSibling;
        }
        if (node !== target.actual_end_child) {
            // We only insert if the ordering of this node should be modified or the parent node is not target
            if (node.claim_order !== undefined || node.parentNode !== target) {
                target.insertBefore(node, target.actual_end_child);
            }
        }
        else {
            target.actual_end_child = node.nextSibling;
        }
    }
    else if (node.parentNode !== target || node.nextSibling !== null) {
        target.appendChild(node);
    }
}
function insert_hydration(target, node, anchor) {
    if (is_hydrating && !anchor) {
        append_hydration(target, node);
    }
    else if (node.parentNode !== target || node.nextSibling != anchor) {
        target.insertBefore(node, anchor || null);
    }
}
function detach(node) {
    if (node.parentNode) {
        node.parentNode.removeChild(node);
    }
}
function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i])
            iterations[i].d(detaching);
    }
}
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function children(element) {
    return Array.from(element.childNodes);
}
function init_claim_info(nodes) {
    if (nodes.claim_info === undefined) {
        nodes.claim_info = { last_index: 0, total_claimed: 0 };
    }
}
function claim_node(nodes, predicate, processNode, createNode, dontUpdateLastIndex = false) {
    // Try to find nodes in an order such that we lengthen the longest increasing subsequence
    init_claim_info(nodes);
    const resultNode = (() => {
        // We first try to find an element after the previous one
        for (let i = nodes.claim_info.last_index; i < nodes.length; i++) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                return node;
            }
        }
        // Otherwise, we try to find one before
        // We iterate in reverse so that we don't go too far back
        for (let i = nodes.claim_info.last_index - 1; i >= 0; i--) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                else if (replacement === undefined) {
                    // Since we spliced before the last_index, we decrease it
                    nodes.claim_info.last_index--;
                }
                return node;
            }
        }
        // If we can't find any matching node, we create a new one
        return createNode();
    })();
    resultNode.claim_order = nodes.claim_info.total_claimed;
    nodes.claim_info.total_claimed += 1;
    return resultNode;
}
function claim_element_base(nodes, name, attributes, create_element) {
    return claim_node(nodes, (node) => node.nodeName === name, (node) => {
        const remove = [];
        for (let j = 0; j < node.attributes.length; j++) {
            const attribute = node.attributes[j];
            if (!attributes[attribute.name]) {
                remove.push(attribute.name);
            }
        }
        remove.forEach(v => node.removeAttribute(v));
        return undefined;
    }, () => create_element(name));
}
function claim_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, element);
}
function claim_text(nodes, data) {
    return claim_node(nodes, (node) => node.nodeType === 3, (node) => {
        const dataStr = '' + data;
        if (node.data.startsWith(dataStr)) {
            if (node.data.length !== dataStr.length) {
                return node.splitText(dataStr.length);
            }
        }
        else {
            node.data = dataStr;
        }
    }, () => text(data), true // Text nodes should not update last index since it is likely not worth it to eliminate an increasing subsequence of actual elements
    );
}
function claim_space(nodes) {
    return claim_text(nodes, ' ');
}
function set_data(text, data) {
    data = '' + data;
    if (text.data === data)
        return;
    text.data = data;
}
function set_input_value(input, value) {
    input.value = value == null ? '' : value;
}
function select_option(select, value, mounting) {
    for (let i = 0; i < select.options.length; i += 1) {
        const option = select.options[i];
        if (option.__value === value) {
            option.selected = true;
            return;
        }
    }
    if (!mounting || value !== undefined) {
        select.selectedIndex = -1; // no option should be selected
    }
}
function select_value(select) {
    const selected_option = select.querySelector(':checked');
    return selected_option && selected_option.__value;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}

const dirty_components = [];
const binding_callbacks = [];
let render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = /* @__PURE__ */ Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();
let flushidx = 0; // Do *not* move this inside the flush() function
function flush() {
    // Do not reenter flush while dirty components are updated, as this can
    // result in an infinite loop. Instead, let the inner flush handle it.
    // Reentrancy is ok afterwards for bindings etc.
    if (flushidx !== 0) {
        return;
    }
    const saved_component = current_component;
    do {
        // first, call beforeUpdate functions
        // and update components
        try {
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
        }
        catch (e) {
            // reset dirty state to not end up in a deadlocked state and then rethrow
            dirty_components.length = 0;
            flushidx = 0;
            throw e;
        }
        set_current_component(null);
        dirty_components.length = 0;
        flushidx = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
/**
 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
 */
function flush_render_callbacks(fns) {
    const filtered = [];
    const targets = [];
    render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
    targets.forEach((c) => c());
    render_callbacks = filtered;
}
const outroing = new Set();
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}

function destroy_block(block, lookup) {
    block.d(1);
    lookup.delete(block.key);
}
function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
    let o = old_blocks.length;
    let n = list.length;
    let i = o;
    const old_indexes = {};
    while (i--)
        old_indexes[old_blocks[i].key] = i;
    const new_blocks = [];
    const new_lookup = new Map();
    const deltas = new Map();
    const updates = [];
    i = n;
    while (i--) {
        const child_ctx = get_context(ctx, list, i);
        const key = get_key(child_ctx);
        let block = lookup.get(key);
        if (!block) {
            block = create_each_block(key, child_ctx);
            block.c();
        }
        else if (dynamic) {
            // defer updates until all the DOM shuffling is done
            updates.push(() => block.p(child_ctx, dirty));
        }
        new_lookup.set(key, new_blocks[i] = block);
        if (key in old_indexes)
            deltas.set(key, Math.abs(i - old_indexes[key]));
    }
    const will_move = new Set();
    const did_move = new Set();
    function insert(block) {
        transition_in(block, 1);
        block.m(node, next);
        lookup.set(block.key, block);
        next = block.first;
        n--;
    }
    while (o && n) {
        const new_block = new_blocks[n - 1];
        const old_block = old_blocks[o - 1];
        const new_key = new_block.key;
        const old_key = old_block.key;
        if (new_block === old_block) {
            // do nothing
            next = new_block.first;
            o--;
            n--;
        }
        else if (!new_lookup.has(old_key)) {
            // remove old block
            destroy(old_block, lookup);
            o--;
        }
        else if (!lookup.has(new_key) || will_move.has(new_key)) {
            insert(new_block);
        }
        else if (did_move.has(old_key)) {
            o--;
        }
        else if (deltas.get(new_key) > deltas.get(old_key)) {
            did_move.add(new_key);
            insert(new_block);
        }
        else {
            will_move.add(old_key);
            o--;
        }
    }
    while (o--) {
        const old_block = old_blocks[o];
        if (!new_lookup.has(old_block.key))
            destroy(old_block, lookup);
    }
    while (n)
        insert(new_blocks[n - 1]);
    run_all(updates);
    return new_blocks;
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
            // if the component was destroyed immediately
            // it will update the `$$.on_destroy` reference to `null`.
            // the destructured on_destroy may still reference to the old array
            if (component.$$.on_destroy) {
                component.$$.on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        flush_render_callbacks($$.after_update);
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: [],
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false,
        root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            start_hydrating();
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        end_hydrating();
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        if (!is_function(callback)) {
            return noop;
        }
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

/* generated by Svelte v3.59.1 */

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[20] = list[i];
	child_ctx[21] = list;
	child_ctx[22] = i;
	return child_ctx;
}

function get_each_context_1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[23] = list[i];
	return child_ctx;
}

function get_each_context_2(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[23] = list[i];
	return child_ctx;
}

// (382:2) {#if clickupTasks.length > 0}
function create_if_block_1(ctx) {
	let table;
	let thead;
	let tr;
	let th0;
	let t0;
	let t1;
	let th1;
	let t2;
	let t3;
	let th2;
	let t4;
	let t5;
	let th3;
	let t6;
	let t7;
	let th4;
	let t8;
	let t9;
	let th5;
	let t10;
	let t11;
	let th6;
	let t12;
	let t13;
	let tbody;
	let each_blocks = [];
	let each_1_lookup = new Map();
	let each_value = /*clickupTasks*/ ctx[2];
	const get_key = ctx => /*task*/ ctx[20].id;

	for (let i = 0; i < each_value.length; i += 1) {
		let child_ctx = get_each_context(ctx, each_value, i);
		let key = get_key(child_ctx);
		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
	}

	return {
		c() {
			table = element("table");
			thead = element("thead");
			tr = element("tr");
			th0 = element("th");
			t0 = text("Task Name");
			t1 = space();
			th1 = element("th");
			t2 = text("Status");
			t3 = space();
			th2 = element("th");
			t4 = text("Priority");
			t5 = space();
			th3 = element("th");
			t6 = text("Assignees");
			t7 = space();
			th4 = element("th");
			t8 = text("Start Date");
			t9 = space();
			th5 = element("th");
			t10 = text("Due Date");
			t11 = space();
			th6 = element("th");
			t12 = text("Actions");
			t13 = space();
			tbody = element("tbody");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			table = claim_element(nodes, "TABLE", { class: true });
			var table_nodes = children(table);
			thead = claim_element(table_nodes, "THEAD", {});
			var thead_nodes = children(thead);
			tr = claim_element(thead_nodes, "TR", { class: true });
			var tr_nodes = children(tr);
			th0 = claim_element(tr_nodes, "TH", { class: true });
			var th0_nodes = children(th0);
			t0 = claim_text(th0_nodes, "Task Name");
			th0_nodes.forEach(detach);
			t1 = claim_space(tr_nodes);
			th1 = claim_element(tr_nodes, "TH", { class: true });
			var th1_nodes = children(th1);
			t2 = claim_text(th1_nodes, "Status");
			th1_nodes.forEach(detach);
			t3 = claim_space(tr_nodes);
			th2 = claim_element(tr_nodes, "TH", { class: true });
			var th2_nodes = children(th2);
			t4 = claim_text(th2_nodes, "Priority");
			th2_nodes.forEach(detach);
			t5 = claim_space(tr_nodes);
			th3 = claim_element(tr_nodes, "TH", { class: true });
			var th3_nodes = children(th3);
			t6 = claim_text(th3_nodes, "Assignees");
			th3_nodes.forEach(detach);
			t7 = claim_space(tr_nodes);
			th4 = claim_element(tr_nodes, "TH", { class: true });
			var th4_nodes = children(th4);
			t8 = claim_text(th4_nodes, "Start Date");
			th4_nodes.forEach(detach);
			t9 = claim_space(tr_nodes);
			th5 = claim_element(tr_nodes, "TH", { class: true });
			var th5_nodes = children(th5);
			t10 = claim_text(th5_nodes, "Due Date");
			th5_nodes.forEach(detach);
			t11 = claim_space(tr_nodes);
			th6 = claim_element(tr_nodes, "TH", { class: true });
			var th6_nodes = children(th6);
			t12 = claim_text(th6_nodes, "Actions");
			th6_nodes.forEach(detach);
			tr_nodes.forEach(detach);
			thead_nodes.forEach(detach);
			t13 = claim_space(table_nodes);
			tbody = claim_element(table_nodes, "TBODY", {});
			var tbody_nodes = children(tbody);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(tbody_nodes);
			}

			tbody_nodes.forEach(detach);
			table_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(th0, "class", "svelte-1q4c7by");
			attr(th1, "class", "svelte-1q4c7by");
			attr(th2, "class", "svelte-1q4c7by");
			attr(th3, "class", "svelte-1q4c7by");
			attr(th4, "class", "svelte-1q4c7by");
			attr(th5, "class", "svelte-1q4c7by");
			attr(th6, "class", "svelte-1q4c7by");
			attr(tr, "class", "svelte-1q4c7by");
			attr(table, "class", "svelte-1q4c7by");
		},
		m(target, anchor) {
			insert_hydration(target, table, anchor);
			append_hydration(table, thead);
			append_hydration(thead, tr);
			append_hydration(tr, th0);
			append_hydration(th0, t0);
			append_hydration(tr, t1);
			append_hydration(tr, th1);
			append_hydration(th1, t2);
			append_hydration(tr, t3);
			append_hydration(tr, th2);
			append_hydration(th2, t4);
			append_hydration(tr, t5);
			append_hydration(tr, th3);
			append_hydration(th3, t6);
			append_hydration(tr, t7);
			append_hydration(tr, th4);
			append_hydration(th4, t8);
			append_hydration(tr, t9);
			append_hydration(tr, th5);
			append_hydration(th5, t10);
			append_hydration(tr, t11);
			append_hydration(tr, th6);
			append_hydration(th6, t12);
			append_hydration(table, t13);
			append_hydration(table, tbody);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(tbody, null);
				}
			}
		},
		p(ctx, dirty) {
			if (dirty & /*editingTaskId, updateClickUpTask, clickupTasks, Date, clickupPriorities, clickupStatuses*/ 740) {
				each_value = /*clickupTasks*/ ctx[2];
				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, tbody, destroy_block, create_each_block, null, get_each_context);
			}
		},
		d(detaching) {
			if (detaching) detach(table);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].d();
			}
		}
	};
}

// (401:14) {:else}
function create_else_block_3(ctx) {
	let t_value = /*task*/ ctx[20].name + "";
	let t;

	return {
		c() {
			t = text(t_value);
		},
		l(nodes) {
			t = claim_text(nodes, t_value);
		},
		m(target, anchor) {
			insert_hydration(target, t, anchor);
		},
		p(ctx, dirty) {
			if (dirty & /*clickupTasks*/ 4 && t_value !== (t_value = /*task*/ ctx[20].name + "")) set_data(t, t_value);
		},
		d(detaching) {
			if (detaching) detach(t);
		}
	};
}

// (399:14) {#if editingTaskId === task.id}
function create_if_block_5(ctx) {
	let input;
	let mounted;
	let dispose;

	function input_input_handler() {
		/*input_input_handler*/ ctx[13].call(input, /*each_value*/ ctx[21], /*task_index*/ ctx[22]);
	}

	return {
		c() {
			input = element("input");
			this.h();
		},
		l(nodes) {
			input = claim_element(nodes, "INPUT", { type: true, class: true });
			this.h();
		},
		h() {
			attr(input, "type", "text");
			attr(input, "class", "svelte-1q4c7by");
		},
		m(target, anchor) {
			insert_hydration(target, input, anchor);
			set_input_value(input, /*task*/ ctx[20].name);

			if (!mounted) {
				dispose = listen(input, "input", input_input_handler);
				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;

			if (dirty & /*clickupTasks, clickupStatuses*/ 68 && input.value !== /*task*/ ctx[20].name) {
				set_input_value(input, /*task*/ ctx[20].name);
			}
		},
		d(detaching) {
			if (detaching) detach(input);
			mounted = false;
			dispose();
		}
	};
}

// (412:14) {:else}
function create_else_block_2(ctx) {
	let t_value = /*task*/ ctx[20].status + "";
	let t;

	return {
		c() {
			t = text(t_value);
		},
		l(nodes) {
			t = claim_text(nodes, t_value);
		},
		m(target, anchor) {
			insert_hydration(target, t, anchor);
		},
		p(ctx, dirty) {
			if (dirty & /*clickupTasks*/ 4 && t_value !== (t_value = /*task*/ ctx[20].status + "")) set_data(t, t_value);
		},
		d(detaching) {
			if (detaching) detach(t);
		}
	};
}

// (406:14) {#if editingTaskId === task.id}
function create_if_block_4(ctx) {
	let select;
	let mounted;
	let dispose;
	let each_value_2 = /*clickupStatuses*/ ctx[6];
	let each_blocks = [];

	for (let i = 0; i < each_value_2.length; i += 1) {
		each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
	}

	function select_change_handler() {
		/*select_change_handler*/ ctx[14].call(select, /*each_value*/ ctx[21], /*task_index*/ ctx[22]);
	}

	return {
		c() {
			select = element("select");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			select = claim_element(nodes, "SELECT", { class: true });
			var select_nodes = children(select);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(select_nodes);
			}

			select_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(select, "class", "svelte-1q4c7by");
			if (/*task*/ ctx[20].status === void 0) add_render_callback(select_change_handler);
		},
		m(target, anchor) {
			insert_hydration(target, select, anchor);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(select, null);
				}
			}

			select_option(select, /*task*/ ctx[20].status, true);

			if (!mounted) {
				dispose = listen(select, "change", select_change_handler);
				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;

			if (dirty & /*clickupStatuses*/ 64) {
				each_value_2 = /*clickupStatuses*/ ctx[6];
				let i;

				for (i = 0; i < each_value_2.length; i += 1) {
					const child_ctx = get_each_context_2(ctx, each_value_2, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_2(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(select, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_2.length;
			}

			if (dirty & /*clickupTasks, clickupStatuses*/ 68) {
				select_option(select, /*task*/ ctx[20].status);
			}
		},
		d(detaching) {
			if (detaching) detach(select);
			destroy_each(each_blocks, detaching);
			mounted = false;
			dispose();
		}
	};
}

// (408:18) {#each clickupStatuses as option}
function create_each_block_2(ctx) {
	let option;
	let t_value = /*option*/ ctx[23] + "";
	let t;

	return {
		c() {
			option = element("option");
			t = text(t_value);
			this.h();
		},
		l(nodes) {
			option = claim_element(nodes, "OPTION", {});
			var option_nodes = children(option);
			t = claim_text(option_nodes, t_value);
			option_nodes.forEach(detach);
			this.h();
		},
		h() {
			option.__value = /*option*/ ctx[23];
			option.value = option.__value;
		},
		m(target, anchor) {
			insert_hydration(target, option, anchor);
			append_hydration(option, t);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(option);
		}
	};
}

// (423:14) {:else}
function create_else_block_1(ctx) {
	let t_value = /*task*/ ctx[20].priority + "";
	let t;

	return {
		c() {
			t = text(t_value);
		},
		l(nodes) {
			t = claim_text(nodes, t_value);
		},
		m(target, anchor) {
			insert_hydration(target, t, anchor);
		},
		p(ctx, dirty) {
			if (dirty & /*clickupTasks*/ 4 && t_value !== (t_value = /*task*/ ctx[20].priority + "")) set_data(t, t_value);
		},
		d(detaching) {
			if (detaching) detach(t);
		}
	};
}

// (417:14) {#if editingTaskId === task.id}
function create_if_block_3(ctx) {
	let select;
	let mounted;
	let dispose;
	let each_value_1 = /*clickupPriorities*/ ctx[7];
	let each_blocks = [];

	for (let i = 0; i < each_value_1.length; i += 1) {
		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
	}

	function select_change_handler_1() {
		/*select_change_handler_1*/ ctx[15].call(select, /*each_value*/ ctx[21], /*task_index*/ ctx[22]);
	}

	return {
		c() {
			select = element("select");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			select = claim_element(nodes, "SELECT", { class: true });
			var select_nodes = children(select);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(select_nodes);
			}

			select_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(select, "class", "svelte-1q4c7by");
			if (/*task*/ ctx[20].priority === void 0) add_render_callback(select_change_handler_1);
		},
		m(target, anchor) {
			insert_hydration(target, select, anchor);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(select, null);
				}
			}

			select_option(select, /*task*/ ctx[20].priority, true);

			if (!mounted) {
				dispose = listen(select, "change", select_change_handler_1);
				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;

			if (dirty & /*clickupPriorities*/ 128) {
				each_value_1 = /*clickupPriorities*/ ctx[7];
				let i;

				for (i = 0; i < each_value_1.length; i += 1) {
					const child_ctx = get_each_context_1(ctx, each_value_1, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_1(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(select, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_1.length;
			}

			if (dirty & /*clickupTasks, clickupStatuses*/ 68) {
				select_option(select, /*task*/ ctx[20].priority);
			}
		},
		d(detaching) {
			if (detaching) detach(select);
			destroy_each(each_blocks, detaching);
			mounted = false;
			dispose();
		}
	};
}

// (419:18) {#each clickupPriorities as option}
function create_each_block_1(ctx) {
	let option;
	let t_value = /*option*/ ctx[23] + "";
	let t;

	return {
		c() {
			option = element("option");
			t = text(t_value);
			this.h();
		},
		l(nodes) {
			option = claim_element(nodes, "OPTION", {});
			var option_nodes = children(option);
			t = claim_text(option_nodes, t_value);
			option_nodes.forEach(detach);
			this.h();
		},
		h() {
			option.__value = /*option*/ ctx[23];
			option.value = option.__value;
		},
		m(target, anchor) {
			insert_hydration(target, option, anchor);
			append_hydration(option, t);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(option);
		}
	};
}

// (440:14) {:else}
function create_else_block(ctx) {
	let button;
	let t;
	let mounted;
	let dispose;

	function click_handler_2() {
		return /*click_handler_2*/ ctx[18](/*task*/ ctx[20]);
	}

	return {
		c() {
			button = element("button");
			t = text("Edit");
			this.h();
		},
		l(nodes) {
			button = claim_element(nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			t = claim_text(button_nodes, "Edit");
			button_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(button, "class", "svelte-1q4c7by");
		},
		m(target, anchor) {
			insert_hydration(target, button, anchor);
			append_hydration(button, t);

			if (!mounted) {
				dispose = listen(button, "click", click_handler_2);
				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
		},
		d(detaching) {
			if (detaching) detach(button);
			mounted = false;
			dispose();
		}
	};
}

// (437:14) {#if editingTaskId === task.id}
function create_if_block_2(ctx) {
	let button0;
	let t0;
	let t1;
	let button1;
	let t2;
	let mounted;
	let dispose;

	function click_handler() {
		return /*click_handler*/ ctx[16](/*task*/ ctx[20]);
	}

	return {
		c() {
			button0 = element("button");
			t0 = text("Save");
			t1 = space();
			button1 = element("button");
			t2 = text("Cancel");
			this.h();
		},
		l(nodes) {
			button0 = claim_element(nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			t0 = claim_text(button0_nodes, "Save");
			button0_nodes.forEach(detach);
			t1 = claim_space(nodes);
			button1 = claim_element(nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			t2 = claim_text(button1_nodes, "Cancel");
			button1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(button0, "class", "svelte-1q4c7by");
			attr(button1, "class", "svelte-1q4c7by");
		},
		m(target, anchor) {
			insert_hydration(target, button0, anchor);
			append_hydration(button0, t0);
			insert_hydration(target, t1, anchor);
			insert_hydration(target, button1, anchor);
			append_hydration(button1, t2);

			if (!mounted) {
				dispose = [
					listen(button0, "click", click_handler),
					listen(button1, "click", /*click_handler_1*/ ctx[17])
				];

				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
		},
		d(detaching) {
			if (detaching) detach(button0);
			if (detaching) detach(t1);
			if (detaching) detach(button1);
			mounted = false;
			run_all(dispose);
		}
	};
}

// (396:8) {#each clickupTasks as task (task.id)}
function create_each_block(key_1, ctx) {
	let tr;
	let td0;
	let t0;
	let td1;
	let t1;
	let td2;
	let t2;
	let td3;
	let t3_value = /*task*/ ctx[20].assignees.map(func).join(', ') + "";
	let t3;
	let t4;
	let td4;

	let t5_value = (/*task*/ ctx[20].start_date
	? new Date(/*task*/ ctx[20].start_date).toLocaleDateString()
	: 'N/A') + "";

	let t5;
	let t6;
	let td5;

	let t7_value = (/*task*/ ctx[20].due_date
	? new Date(/*task*/ ctx[20].due_date).toLocaleDateString()
	: 'N/A') + "";

	let t7;
	let t8;
	let td6;
	let t9;

	function select_block_type(ctx, dirty) {
		if (/*editingTaskId*/ ctx[5] === /*task*/ ctx[20].id) return create_if_block_5;
		return create_else_block_3;
	}

	let current_block_type = select_block_type(ctx);
	let if_block0 = current_block_type(ctx);

	function select_block_type_1(ctx, dirty) {
		if (/*editingTaskId*/ ctx[5] === /*task*/ ctx[20].id) return create_if_block_4;
		return create_else_block_2;
	}

	let current_block_type_1 = select_block_type_1(ctx);
	let if_block1 = current_block_type_1(ctx);

	function select_block_type_2(ctx, dirty) {
		if (/*editingTaskId*/ ctx[5] === /*task*/ ctx[20].id) return create_if_block_3;
		return create_else_block_1;
	}

	let current_block_type_2 = select_block_type_2(ctx);
	let if_block2 = current_block_type_2(ctx);

	function select_block_type_3(ctx, dirty) {
		if (/*editingTaskId*/ ctx[5] === /*task*/ ctx[20].id) return create_if_block_2;
		return create_else_block;
	}

	let current_block_type_3 = select_block_type_3(ctx);
	let if_block3 = current_block_type_3(ctx);

	return {
		key: key_1,
		first: null,
		c() {
			tr = element("tr");
			td0 = element("td");
			if_block0.c();
			t0 = space();
			td1 = element("td");
			if_block1.c();
			t1 = space();
			td2 = element("td");
			if_block2.c();
			t2 = space();
			td3 = element("td");
			t3 = text(t3_value);
			t4 = space();
			td4 = element("td");
			t5 = text(t5_value);
			t6 = space();
			td5 = element("td");
			t7 = text(t7_value);
			t8 = space();
			td6 = element("td");
			if_block3.c();
			t9 = space();
			this.h();
		},
		l(nodes) {
			tr = claim_element(nodes, "TR", { class: true });
			var tr_nodes = children(tr);
			td0 = claim_element(tr_nodes, "TD", { class: true });
			var td0_nodes = children(td0);
			if_block0.l(td0_nodes);
			td0_nodes.forEach(detach);
			t0 = claim_space(tr_nodes);
			td1 = claim_element(tr_nodes, "TD", { class: true });
			var td1_nodes = children(td1);
			if_block1.l(td1_nodes);
			td1_nodes.forEach(detach);
			t1 = claim_space(tr_nodes);
			td2 = claim_element(tr_nodes, "TD", { class: true });
			var td2_nodes = children(td2);
			if_block2.l(td2_nodes);
			td2_nodes.forEach(detach);
			t2 = claim_space(tr_nodes);
			td3 = claim_element(tr_nodes, "TD", { class: true });
			var td3_nodes = children(td3);
			t3 = claim_text(td3_nodes, t3_value);
			td3_nodes.forEach(detach);
			t4 = claim_space(tr_nodes);
			td4 = claim_element(tr_nodes, "TD", { class: true });
			var td4_nodes = children(td4);
			t5 = claim_text(td4_nodes, t5_value);
			td4_nodes.forEach(detach);
			t6 = claim_space(tr_nodes);
			td5 = claim_element(tr_nodes, "TD", { class: true });
			var td5_nodes = children(td5);
			t7 = claim_text(td5_nodes, t7_value);
			td5_nodes.forEach(detach);
			t8 = claim_space(tr_nodes);
			td6 = claim_element(tr_nodes, "TD", { class: true });
			var td6_nodes = children(td6);
			if_block3.l(td6_nodes);
			td6_nodes.forEach(detach);
			t9 = claim_space(tr_nodes);
			tr_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(td0, "class", "svelte-1q4c7by");
			attr(td1, "class", "svelte-1q4c7by");
			attr(td2, "class", "svelte-1q4c7by");
			attr(td3, "class", "svelte-1q4c7by");
			attr(td4, "class", "svelte-1q4c7by");
			attr(td5, "class", "svelte-1q4c7by");
			attr(td6, "class", "svelte-1q4c7by");
			attr(tr, "class", "svelte-1q4c7by");
			this.first = tr;
		},
		m(target, anchor) {
			insert_hydration(target, tr, anchor);
			append_hydration(tr, td0);
			if_block0.m(td0, null);
			append_hydration(tr, t0);
			append_hydration(tr, td1);
			if_block1.m(td1, null);
			append_hydration(tr, t1);
			append_hydration(tr, td2);
			if_block2.m(td2, null);
			append_hydration(tr, t2);
			append_hydration(tr, td3);
			append_hydration(td3, t3);
			append_hydration(tr, t4);
			append_hydration(tr, td4);
			append_hydration(td4, t5);
			append_hydration(tr, t6);
			append_hydration(tr, td5);
			append_hydration(td5, t7);
			append_hydration(tr, t8);
			append_hydration(tr, td6);
			if_block3.m(td6, null);
			append_hydration(tr, t9);
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;

			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block0) {
				if_block0.p(ctx, dirty);
			} else {
				if_block0.d(1);
				if_block0 = current_block_type(ctx);

				if (if_block0) {
					if_block0.c();
					if_block0.m(td0, null);
				}
			}

			if (current_block_type_1 === (current_block_type_1 = select_block_type_1(ctx)) && if_block1) {
				if_block1.p(ctx, dirty);
			} else {
				if_block1.d(1);
				if_block1 = current_block_type_1(ctx);

				if (if_block1) {
					if_block1.c();
					if_block1.m(td1, null);
				}
			}

			if (current_block_type_2 === (current_block_type_2 = select_block_type_2(ctx)) && if_block2) {
				if_block2.p(ctx, dirty);
			} else {
				if_block2.d(1);
				if_block2 = current_block_type_2(ctx);

				if (if_block2) {
					if_block2.c();
					if_block2.m(td2, null);
				}
			}

			if (dirty & /*clickupTasks*/ 4 && t3_value !== (t3_value = /*task*/ ctx[20].assignees.map(func).join(', ') + "")) set_data(t3, t3_value);

			if (dirty & /*clickupTasks*/ 4 && t5_value !== (t5_value = (/*task*/ ctx[20].start_date
			? new Date(/*task*/ ctx[20].start_date).toLocaleDateString()
			: 'N/A') + "")) set_data(t5, t5_value);

			if (dirty & /*clickupTasks*/ 4 && t7_value !== (t7_value = (/*task*/ ctx[20].due_date
			? new Date(/*task*/ ctx[20].due_date).toLocaleDateString()
			: 'N/A') + "")) set_data(t7, t7_value);

			if (current_block_type_3 === (current_block_type_3 = select_block_type_3(ctx)) && if_block3) {
				if_block3.p(ctx, dirty);
			} else {
				if_block3.d(1);
				if_block3 = current_block_type_3(ctx);

				if (if_block3) {
					if_block3.c();
					if_block3.m(td6, null);
				}
			}
		},
		d(detaching) {
			if (detaching) detach(tr);
			if_block0.d();
			if_block1.d();
			if_block2.d();
			if_block3.d();
		}
	};
}

// (450:2) {#if response}
function create_if_block(ctx) {
	let div;
	let h3;
	let t0;
	let t1;
	let pre;
	let t2;

	return {
		c() {
			div = element("div");
			h3 = element("h3");
			t0 = text("Response:");
			t1 = space();
			pre = element("pre");
			t2 = text(/*response*/ ctx[3]);
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			h3 = claim_element(div_nodes, "H3", { class: true });
			var h3_nodes = children(h3);
			t0 = claim_text(h3_nodes, "Response:");
			h3_nodes.forEach(detach);
			t1 = claim_space(div_nodes);
			pre = claim_element(div_nodes, "PRE", { class: true });
			var pre_nodes = children(pre);
			t2 = claim_text(pre_nodes, /*response*/ ctx[3]);
			pre_nodes.forEach(detach);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h3, "class", "svelte-1q4c7by");
			attr(pre, "class", "svelte-1q4c7by");
			attr(div, "class", "response svelte-1q4c7by");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, h3);
			append_hydration(h3, t0);
			append_hydration(div, t1);
			append_hydration(div, pre);
			append_hydration(pre, t2);
		},
		p(ctx, dirty) {
			if (dirty & /*response*/ 8) set_data(t2, /*response*/ ctx[3]);
		},
		d(detaching) {
			if (detaching) detach(div);
		}
	};
}

function create_fragment(ctx) {
	let div4;
	let h2;
	let t0;
	let t1;
	let div2;
	let div0;
	let label0;
	let t2;
	let t3;
	let input0;
	let t4;
	let div1;
	let label1;
	let t5;
	let t6;
	let input1;
	let t7;
	let div3;
	let button;
	let t8_value = (/*loading*/ ctx[4] ? 'Fetching...' : 'Fetch Tasks') + "";
	let t8;
	let t9;
	let t10;
	let mounted;
	let dispose;
	let if_block0 = /*clickupTasks*/ ctx[2].length > 0 && create_if_block_1(ctx);
	let if_block1 = /*response*/ ctx[3] && create_if_block(ctx);

	return {
		c() {
			div4 = element("div");
			h2 = element("h2");
			t0 = text("ClickUp Fetch, Edit & Update");
			t1 = space();
			div2 = element("div");
			div0 = element("div");
			label0 = element("label");
			t2 = text("ClickUp API Key");
			t3 = space();
			input0 = element("input");
			t4 = space();
			div1 = element("div");
			label1 = element("label");
			t5 = text("ClickUp List ID");
			t6 = space();
			input1 = element("input");
			t7 = space();
			div3 = element("div");
			button = element("button");
			t8 = text(t8_value);
			t9 = space();
			if (if_block0) if_block0.c();
			t10 = space();
			if (if_block1) if_block1.c();
			this.h();
		},
		l(nodes) {
			div4 = claim_element(nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			h2 = claim_element(div4_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t0 = claim_text(h2_nodes, "ClickUp Fetch, Edit & Update");
			h2_nodes.forEach(detach);
			t1 = claim_space(div4_nodes);
			div2 = claim_element(div4_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			div0 = claim_element(div2_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			label0 = claim_element(div0_nodes, "LABEL", { for: true, class: true });
			var label0_nodes = children(label0);
			t2 = claim_text(label0_nodes, "ClickUp API Key");
			label0_nodes.forEach(detach);
			t3 = claim_space(div0_nodes);

			input0 = claim_element(div0_nodes, "INPUT", {
				type: true,
				id: true,
				placeholder: true,
				class: true
			});

			div0_nodes.forEach(detach);
			t4 = claim_space(div2_nodes);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			label1 = claim_element(div1_nodes, "LABEL", { for: true, class: true });
			var label1_nodes = children(label1);
			t5 = claim_text(label1_nodes, "ClickUp List ID");
			label1_nodes.forEach(detach);
			t6 = claim_space(div1_nodes);

			input1 = claim_element(div1_nodes, "INPUT", {
				type: true,
				id: true,
				placeholder: true,
				class: true
			});

			div1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t7 = claim_space(div4_nodes);
			div3 = claim_element(div4_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			button = claim_element(div3_nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			t8 = claim_text(button_nodes, t8_value);
			button_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			t9 = claim_space(div4_nodes);
			if (if_block0) if_block0.l(div4_nodes);
			t10 = claim_space(div4_nodes);
			if (if_block1) if_block1.l(div4_nodes);
			div4_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h2, "class", "svelte-1q4c7by");
			attr(label0, "for", "clickupApiKey");
			attr(label0, "class", "svelte-1q4c7by");
			attr(input0, "type", "text");
			attr(input0, "id", "clickupApiKey");
			attr(input0, "placeholder", "API Key");
			attr(input0, "class", "svelte-1q4c7by");
			attr(div0, "class", "form-group svelte-1q4c7by");
			attr(label1, "for", "clickupListId");
			attr(label1, "class", "svelte-1q4c7by");
			attr(input1, "type", "text");
			attr(input1, "id", "clickupListId");
			attr(input1, "placeholder", "List ID");
			attr(input1, "class", "svelte-1q4c7by");
			attr(div1, "class", "form-group svelte-1q4c7by");
			attr(div2, "class", "form-row svelte-1q4c7by");
			attr(button, "class", "fetch-button svelte-1q4c7by");
			button.disabled = /*loading*/ ctx[4];
			attr(div3, "class", "button-group svelte-1q4c7by");
			attr(div4, "class", "clickup-table svelte-1q4c7by");
		},
		m(target, anchor) {
			insert_hydration(target, div4, anchor);
			append_hydration(div4, h2);
			append_hydration(h2, t0);
			append_hydration(div4, t1);
			append_hydration(div4, div2);
			append_hydration(div2, div0);
			append_hydration(div0, label0);
			append_hydration(label0, t2);
			append_hydration(div0, t3);
			append_hydration(div0, input0);
			set_input_value(input0, /*clickupApiKey*/ ctx[0]);
			append_hydration(div2, t4);
			append_hydration(div2, div1);
			append_hydration(div1, label1);
			append_hydration(label1, t5);
			append_hydration(div1, t6);
			append_hydration(div1, input1);
			set_input_value(input1, /*clickupListId*/ ctx[1]);
			append_hydration(div4, t7);
			append_hydration(div4, div3);
			append_hydration(div3, button);
			append_hydration(button, t8);
			append_hydration(div4, t9);
			if (if_block0) if_block0.m(div4, null);
			append_hydration(div4, t10);
			if (if_block1) if_block1.m(div4, null);

			if (!mounted) {
				dispose = [
					listen(input0, "input", /*input0_input_handler*/ ctx[11]),
					listen(input1, "input", /*input1_input_handler*/ ctx[12]),
					listen(button, "click", /*fetchClickUpTasks*/ ctx[8])
				];

				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			if (dirty & /*clickupApiKey*/ 1 && input0.value !== /*clickupApiKey*/ ctx[0]) {
				set_input_value(input0, /*clickupApiKey*/ ctx[0]);
			}

			if (dirty & /*clickupListId*/ 2 && input1.value !== /*clickupListId*/ ctx[1]) {
				set_input_value(input1, /*clickupListId*/ ctx[1]);
			}

			if (dirty & /*loading*/ 16 && t8_value !== (t8_value = (/*loading*/ ctx[4] ? 'Fetching...' : 'Fetch Tasks') + "")) set_data(t8, t8_value);

			if (dirty & /*loading*/ 16) {
				button.disabled = /*loading*/ ctx[4];
			}

			if (/*clickupTasks*/ ctx[2].length > 0) {
				if (if_block0) {
					if_block0.p(ctx, dirty);
				} else {
					if_block0 = create_if_block_1(ctx);
					if_block0.c();
					if_block0.m(div4, t10);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (/*response*/ ctx[3]) {
				if (if_block1) {
					if_block1.p(ctx, dirty);
				} else {
					if_block1 = create_if_block(ctx);
					if_block1.c();
					if_block1.m(div4, null);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(div4);
			if (if_block0) if_block0.d();
			if (if_block1) if_block1.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

const func = a => a.id;

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;
	let clickupApiKey = '';
	let clickupListId = '';
	let clickupTasks = [];
	let response = '';
	let loading = false;
	let editingTaskId = null;
	const clickupStatuses = ['Open', 'In Progress', 'Review', 'Closed', 'To do'];
	const clickupPriorities = ['Urgent', 'High', 'Normal', 'Low'];

	// ClickUp API actually uses these priority values
	const clickupPriorityMap = {
		1: 'Urgent', // p1 = Urgent
		2: 'High', // p2 = High
		3: 'Normal', // p3 = Normal
		4: 'Low', // p4 = Low
		
	};

	async function fetchClickUpTasks() {
		$$invalidate(4, loading = true);
		$$invalidate(3, response = '');
		$$invalidate(2, clickupTasks = []);

		// Verify inputs before making the request
		if (!clickupApiKey) {
			$$invalidate(3, response = 'Error: API key is required');
			$$invalidate(4, loading = false);
			return;
		}

		if (!clickupListId) {
			$$invalidate(3, response = 'Error: List ID is required');
			$$invalidate(4, loading = false);
			return;
		}

		const clickupUrl = `https://api.clickup.com/api/v2/list/${clickupListId}/task`;

		try {
			const result = await fetch(clickupUrl, {
				method: 'GET',
				headers: {
					'Authorization': clickupApiKey.startsWith('pk_')
					? clickupApiKey
					: `Bearer ${clickupApiKey}`,
					'Content-Type': 'application/json'
				}
			});

			if (result.ok) {
				const data = await result.json();

				if (data.tasks && Array.isArray(data.tasks)) {
					$$invalidate(2, clickupTasks = data.tasks.map(task => {
						// Handle status
						let status = 'Open'; // Default value

						if (task.status) {
							if (typeof task.status === 'object' && task.status.status) {
								status = task.status.status;
							} else if (typeof task.status === 'string') {
								status = task.status;
							}

							// Capitalize first letter
							status = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
						}

						// Handle priority - completely revised
						let priority = 'Normal'; // Default value

						// Debug the priority value
						console.log('Task priority raw value:', JSON.stringify(task.priority));

						if (task.priority) {
							if (typeof task.priority === 'object') {
								// If it's an object, it might have a 'priority' or 'id' field
								const priorityValue = task.priority.priority || task.priority.id;

								if (priorityValue) {
									priority = clickupPriorityMap[priorityValue] || 'Normal';
								}
							} else if (typeof task.priority === 'number') {
								// If it's a direct number
								priority = clickupPriorityMap[task.priority] || 'Normal';
							} else if (typeof task.priority === 'string') {
								// If it's a string, try to match it directly
								const priorityNumber = parseInt(task.priority);

								if (!isNaN(priorityNumber)) {
									priority = clickupPriorityMap[priorityNumber] || 'Normal';
								} else {
									// Try to match by name
									const priorityIndex = clickupPriorities.findIndex(p => p.toLowerCase() === task.priority.toLowerCase());

									if (priorityIndex !== -1) {
										priority = clickupPriorities[priorityIndex];
									}
								}
							}
						}

						return { ...task, status, priority };
					}));

					$$invalidate(3, response = 'ClickUp tasks fetched successfully.');
				} else {
					$$invalidate(3, response = 'Error: No tasks found or unexpected response format');
				}
			} else {
				$$invalidate(3, response = `Error: ${result.status} ${result.statusText}`);
			}
		} catch(error) {
			$$invalidate(3, response = `Error: ${error.message}`);
		} finally {
			$$invalidate(4, loading = false);
		}
	}

	async function updateClickUpTask(task) {
		$$invalidate(4, loading = true);
		$$invalidate(3, response = '');

		if (!clickupApiKey) {
			$$invalidate(3, response = 'Error: API key is required');
			$$invalidate(4, loading = false);
			return;
		}

		// Convert priority string back to number for ClickUp API
		let priorityNum = 3; // Default to Normal (3)

		// Reverse lookup in the priority map
		for (const [key, value] of Object.entries(clickupPriorityMap)) {
			if (value === task.priority) {
				priorityNum = parseInt(key);
				break;
			}
		}

		const clickupTask = {
			name: task.name,
			description: task.description,
			status: task.status.toLowerCase(),
			priority: priorityNum,
			assignees: task.assignees,
			start_date: task.start_date,
			due_date: task.due_date
		};

		const clickupUrl = `https://api.clickup.com/api/v2/task/${task.id}`;

		try {
			const result = await fetch(clickupUrl, {
				method: 'PUT',
				headers: {
					'Authorization': clickupApiKey.startsWith('pk_')
					? clickupApiKey
					: `Bearer ${clickupApiKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(clickupTask)
			});

			if (result.ok) {
				$$invalidate(3, response = `Task "${task.name}" updated successfully.`);
			} else {
				$$invalidate(3, response = `Error: ${result.status} ${result.statusText}`);
			}
		} catch(error) {
			$$invalidate(3, response = `Error: ${error.message}`);
		} finally {
			$$invalidate(4, loading = false);
			$$invalidate(5, editingTaskId = null);
			fetchClickUpTasks(); // Refresh tasks after update
		}
	}

	function input0_input_handler() {
		clickupApiKey = this.value;
		$$invalidate(0, clickupApiKey);
	}

	function input1_input_handler() {
		clickupListId = this.value;
		$$invalidate(1, clickupListId);
	}

	function input_input_handler(each_value, task_index) {
		each_value[task_index].name = this.value;
		$$invalidate(2, clickupTasks);
		$$invalidate(6, clickupStatuses);
	}

	function select_change_handler(each_value, task_index) {
		each_value[task_index].status = select_value(this);
		$$invalidate(2, clickupTasks);
		$$invalidate(6, clickupStatuses);
	}

	function select_change_handler_1(each_value, task_index) {
		each_value[task_index].priority = select_value(this);
		$$invalidate(2, clickupTasks);
		$$invalidate(6, clickupStatuses);
	}

	const click_handler = task => updateClickUpTask(task);
	const click_handler_1 = () => $$invalidate(5, editingTaskId = null);
	const click_handler_2 = task => $$invalidate(5, editingTaskId = task.id);

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(10, props = $$props.props);
	};

	return [
		clickupApiKey,
		clickupListId,
		clickupTasks,
		response,
		loading,
		editingTaskId,
		clickupStatuses,
		clickupPriorities,
		fetchClickUpTasks,
		updateClickUpTask,
		props,
		input0_input_handler,
		input1_input_handler,
		input_input_handler,
		select_change_handler,
		select_change_handler_1,
		click_handler,
		click_handler_1,
		click_handler_2
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, { props: 10 });
	}
}

export { Component as default };
