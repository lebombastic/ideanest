// Clickup creating task - Updated March 19, 2025
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
function to_number(value) {
    return value === '' ? null : +value;
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
	child_ctx[26] = list[i];
	return child_ctx;
}

function get_each_context_1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[26] = list[i];
	return child_ctx;
}

// (169:8) {#each clickupStatuses as option}
function create_each_block_1(ctx) {
	let option;
	let t_value = /*option*/ ctx[26] + "";
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
			option.__value = /*option*/ ctx[26];
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

// (178:8) {#each clickupPriorities as option}
function create_each_block(ctx) {
	let option;
	let t_value = /*option*/ ctx[26] + "";
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
			option.__value = /*option*/ ctx[26];
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

// (218:2) {#if response}
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
			t2 = text(/*response*/ ctx[10]);
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			h3 = claim_element(div_nodes, "H3", {});
			var h3_nodes = children(h3);
			t0 = claim_text(h3_nodes, "Response:");
			h3_nodes.forEach(detach);
			t1 = claim_space(div_nodes);
			pre = claim_element(div_nodes, "PRE", { class: true });
			var pre_nodes = children(pre);
			t2 = claim_text(pre_nodes, /*response*/ ctx[10]);
			pre_nodes.forEach(detach);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(pre, "class", "svelte-1xrdgd6");
			attr(div, "class", "response svelte-1xrdgd6");
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
			if (dirty & /*response*/ 1024) set_data(t2, /*response*/ ctx[10]);
		},
		d(detaching) {
			if (detaching) detach(div);
		}
	};
}

function create_fragment(ctx) {
	let div14;
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
	let label2;
	let t8;
	let t9;
	let textarea;
	let t10;
	let div6;
	let div4;
	let label3;
	let t11;
	let t12;
	let select0;
	let t13;
	let div5;
	let label4;
	let t14;
	let t15;
	let select1;
	let t16;
	let div10;
	let div7;
	let label5;
	let t17;
	let t18;
	let input2;
	let t19;
	let div8;
	let label6;
	let t20;
	let t21;
	let input3;
	let t22;
	let div9;
	let label7;
	let t23;
	let t24;
	let input4;
	let t25;
	let div13;
	let div11;
	let label8;
	let t26;
	let t27;
	let input5;
	let t28;
	let div12;
	let label9;
	let t29;
	let t30;
	let input6;
	let t31;
	let button;
	let t32_value = (/*loading*/ ctx[11] ? 'Creating...' : 'Create Task') + "";
	let t32;
	let t33;
	let mounted;
	let dispose;
	let each_value_1 = /*clickupStatuses*/ ctx[12];
	let each_blocks_1 = [];

	for (let i = 0; i < each_value_1.length; i += 1) {
		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
	}

	let each_value = /*clickupPriorities*/ ctx[13];
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	let if_block = /*response*/ ctx[10] && create_if_block(ctx);

	return {
		c() {
			div14 = element("div");
			h2 = element("h2");
			t0 = text("Create ClickUp Task");
			t1 = space();
			div2 = element("div");
			div0 = element("div");
			label0 = element("label");
			t2 = text("Record ID (Optional)");
			t3 = space();
			input0 = element("input");
			t4 = space();
			div1 = element("div");
			label1 = element("label");
			t5 = text("Task Name");
			t6 = space();
			input1 = element("input");
			t7 = space();
			div3 = element("div");
			label2 = element("label");
			t8 = text("Task Description");
			t9 = space();
			textarea = element("textarea");
			t10 = space();
			div6 = element("div");
			div4 = element("div");
			label3 = element("label");
			t11 = text("Status");
			t12 = space();
			select0 = element("select");

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].c();
			}

			t13 = space();
			div5 = element("div");
			label4 = element("label");
			t14 = text("Priority");
			t15 = space();
			select1 = element("select");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t16 = space();
			div10 = element("div");
			div7 = element("div");
			label5 = element("label");
			t17 = text("Assignee (User ID)");
			t18 = space();
			input2 = element("input");
			t19 = space();
			div8 = element("div");
			label6 = element("label");
			t20 = text("Start Date");
			t21 = space();
			input3 = element("input");
			t22 = space();
			div9 = element("div");
			label7 = element("label");
			t23 = text("Due Date");
			t24 = space();
			input4 = element("input");
			t25 = space();
			div13 = element("div");
			div11 = element("div");
			label8 = element("label");
			t26 = text("ClickUp API Key");
			t27 = space();
			input5 = element("input");
			t28 = space();
			div12 = element("div");
			label9 = element("label");
			t29 = text("ClickUp List ID");
			t30 = space();
			input6 = element("input");
			t31 = space();
			button = element("button");
			t32 = text(t32_value);
			t33 = space();
			if (if_block) if_block.c();
			this.h();
		},
		l(nodes) {
			div14 = claim_element(nodes, "DIV", { class: true });
			var div14_nodes = children(div14);
			h2 = claim_element(div14_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t0 = claim_text(h2_nodes, "Create ClickUp Task");
			h2_nodes.forEach(detach);
			t1 = claim_space(div14_nodes);
			div2 = claim_element(div14_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			div0 = claim_element(div2_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			label0 = claim_element(div0_nodes, "LABEL", { for: true, class: true });
			var label0_nodes = children(label0);
			t2 = claim_text(label0_nodes, "Record ID (Optional)");
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
			t5 = claim_text(label1_nodes, "Task Name");
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
			t7 = claim_space(div14_nodes);
			div3 = claim_element(div14_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			label2 = claim_element(div3_nodes, "LABEL", { for: true, class: true });
			var label2_nodes = children(label2);
			t8 = claim_text(label2_nodes, "Task Description");
			label2_nodes.forEach(detach);
			t9 = claim_space(div3_nodes);
			textarea = claim_element(div3_nodes, "TEXTAREA", { id: true, placeholder: true, class: true });
			children(textarea).forEach(detach);
			div3_nodes.forEach(detach);
			t10 = claim_space(div14_nodes);
			div6 = claim_element(div14_nodes, "DIV", { class: true });
			var div6_nodes = children(div6);
			div4 = claim_element(div6_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			label3 = claim_element(div4_nodes, "LABEL", { for: true, class: true });
			var label3_nodes = children(label3);
			t11 = claim_text(label3_nodes, "Status");
			label3_nodes.forEach(detach);
			t12 = claim_space(div4_nodes);
			select0 = claim_element(div4_nodes, "SELECT", { id: true, class: true });
			var select0_nodes = children(select0);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].l(select0_nodes);
			}

			select0_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			t13 = claim_space(div6_nodes);
			div5 = claim_element(div6_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			label4 = claim_element(div5_nodes, "LABEL", { for: true, class: true });
			var label4_nodes = children(label4);
			t14 = claim_text(label4_nodes, "Priority");
			label4_nodes.forEach(detach);
			t15 = claim_space(div5_nodes);
			select1 = claim_element(div5_nodes, "SELECT", { id: true, class: true });
			var select1_nodes = children(select1);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(select1_nodes);
			}

			select1_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			div6_nodes.forEach(detach);
			t16 = claim_space(div14_nodes);
			div10 = claim_element(div14_nodes, "DIV", { class: true });
			var div10_nodes = children(div10);
			div7 = claim_element(div10_nodes, "DIV", { class: true });
			var div7_nodes = children(div7);
			label5 = claim_element(div7_nodes, "LABEL", { for: true, class: true });
			var label5_nodes = children(label5);
			t17 = claim_text(label5_nodes, "Assignee (User ID)");
			label5_nodes.forEach(detach);
			t18 = claim_space(div7_nodes);

			input2 = claim_element(div7_nodes, "INPUT", {
				type: true,
				id: true,
				placeholder: true,
				class: true
			});

			div7_nodes.forEach(detach);
			t19 = claim_space(div10_nodes);
			div8 = claim_element(div10_nodes, "DIV", { class: true });
			var div8_nodes = children(div8);
			label6 = claim_element(div8_nodes, "LABEL", { for: true, class: true });
			var label6_nodes = children(label6);
			t20 = claim_text(label6_nodes, "Start Date");
			label6_nodes.forEach(detach);
			t21 = claim_space(div8_nodes);
			input3 = claim_element(div8_nodes, "INPUT", { type: true, id: true, class: true });
			div8_nodes.forEach(detach);
			t22 = claim_space(div10_nodes);
			div9 = claim_element(div10_nodes, "DIV", { class: true });
			var div9_nodes = children(div9);
			label7 = claim_element(div9_nodes, "LABEL", { for: true, class: true });
			var label7_nodes = children(label7);
			t23 = claim_text(label7_nodes, "Due Date");
			label7_nodes.forEach(detach);
			t24 = claim_space(div9_nodes);
			input4 = claim_element(div9_nodes, "INPUT", { type: true, id: true, class: true });
			div9_nodes.forEach(detach);
			div10_nodes.forEach(detach);
			t25 = claim_space(div14_nodes);
			div13 = claim_element(div14_nodes, "DIV", { class: true });
			var div13_nodes = children(div13);
			div11 = claim_element(div13_nodes, "DIV", { class: true });
			var div11_nodes = children(div11);
			label8 = claim_element(div11_nodes, "LABEL", { for: true, class: true });
			var label8_nodes = children(label8);
			t26 = claim_text(label8_nodes, "ClickUp API Key");
			label8_nodes.forEach(detach);
			t27 = claim_space(div11_nodes);

			input5 = claim_element(div11_nodes, "INPUT", {
				type: true,
				id: true,
				placeholder: true,
				class: true
			});

			div11_nodes.forEach(detach);
			t28 = claim_space(div13_nodes);
			div12 = claim_element(div13_nodes, "DIV", { class: true });
			var div12_nodes = children(div12);
			label9 = claim_element(div12_nodes, "LABEL", { for: true, class: true });
			var label9_nodes = children(label9);
			t29 = claim_text(label9_nodes, "ClickUp List ID");
			label9_nodes.forEach(detach);
			t30 = claim_space(div12_nodes);

			input6 = claim_element(div12_nodes, "INPUT", {
				type: true,
				id: true,
				placeholder: true,
				class: true
			});

			div12_nodes.forEach(detach);
			div13_nodes.forEach(detach);
			t31 = claim_space(div14_nodes);
			button = claim_element(div14_nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			t32 = claim_text(button_nodes, t32_value);
			button_nodes.forEach(detach);
			t33 = claim_space(div14_nodes);
			if (if_block) if_block.l(div14_nodes);
			div14_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h2, "class", "svelte-1xrdgd6");
			attr(label0, "for", "recordId");
			attr(label0, "class", "svelte-1xrdgd6");
			attr(input0, "type", "text");
			attr(input0, "id", "recordId");
			attr(input0, "placeholder", "Optional");
			attr(input0, "class", "svelte-1xrdgd6");
			attr(div0, "class", "form-group svelte-1xrdgd6");
			attr(label1, "for", "taskName");
			attr(label1, "class", "svelte-1xrdgd6");
			attr(input1, "type", "text");
			attr(input1, "id", "taskName");
			attr(input1, "placeholder", "Task Name");
			attr(input1, "class", "svelte-1xrdgd6");
			attr(div1, "class", "form-group svelte-1xrdgd6");
			attr(div2, "class", "form-row svelte-1xrdgd6");
			attr(label2, "for", "taskDescription");
			attr(label2, "class", "svelte-1xrdgd6");
			attr(textarea, "id", "taskDescription");
			attr(textarea, "placeholder", "Task Description");
			attr(textarea, "class", "svelte-1xrdgd6");
			attr(div3, "class", "form-group svelte-1xrdgd6");
			attr(label3, "for", "status");
			attr(label3, "class", "svelte-1xrdgd6");
			attr(select0, "id", "status");
			attr(select0, "class", "svelte-1xrdgd6");
			if (/*status*/ ctx[5] === void 0) add_render_callback(() => /*select0_change_handler*/ ctx[19].call(select0));
			attr(div4, "class", "form-group svelte-1xrdgd6");
			attr(label4, "for", "priority");
			attr(label4, "class", "svelte-1xrdgd6");
			attr(select1, "id", "priority");
			attr(select1, "class", "svelte-1xrdgd6");
			if (/*priority*/ ctx[6] === void 0) add_render_callback(() => /*select1_change_handler*/ ctx[20].call(select1));
			attr(div5, "class", "form-group svelte-1xrdgd6");
			attr(div6, "class", "form-row svelte-1xrdgd6");
			attr(label5, "for", "assignee");
			attr(label5, "class", "svelte-1xrdgd6");
			attr(input2, "type", "number");
			attr(input2, "id", "assignee");
			attr(input2, "placeholder", "User ID");
			attr(input2, "class", "svelte-1xrdgd6");
			attr(div7, "class", "form-group svelte-1xrdgd6");
			attr(label6, "for", "startDate");
			attr(label6, "class", "svelte-1xrdgd6");
			attr(input3, "type", "date");
			attr(input3, "id", "startDate");
			attr(input3, "class", "svelte-1xrdgd6");
			attr(div8, "class", "form-group svelte-1xrdgd6");
			attr(label7, "for", "dueDate");
			attr(label7, "class", "svelte-1xrdgd6");
			attr(input4, "type", "date");
			attr(input4, "id", "dueDate");
			attr(input4, "class", "svelte-1xrdgd6");
			attr(div9, "class", "form-group svelte-1xrdgd6");
			attr(div10, "class", "form-row svelte-1xrdgd6");
			attr(label8, "for", "clickupApiKey");
			attr(label8, "class", "svelte-1xrdgd6");
			attr(input5, "type", "text");
			attr(input5, "id", "clickupApiKey");
			attr(input5, "placeholder", "API Key");
			attr(input5, "class", "svelte-1xrdgd6");
			attr(div11, "class", "form-group svelte-1xrdgd6");
			attr(label9, "for", "clickupListId");
			attr(label9, "class", "svelte-1xrdgd6");
			attr(input6, "type", "text");
			attr(input6, "id", "clickupListId");
			attr(input6, "placeholder", "List ID");
			attr(input6, "class", "svelte-1xrdgd6");
			attr(div12, "class", "form-group svelte-1xrdgd6");
			attr(div13, "class", "form-row svelte-1xrdgd6");
			attr(button, "class", "submit-button svelte-1xrdgd6");
			button.disabled = /*loading*/ ctx[11];
			attr(div14, "class", "clickup-form svelte-1xrdgd6");
		},
		m(target, anchor) {
			insert_hydration(target, div14, anchor);
			append_hydration(div14, h2);
			append_hydration(h2, t0);
			append_hydration(div14, t1);
			append_hydration(div14, div2);
			append_hydration(div2, div0);
			append_hydration(div0, label0);
			append_hydration(label0, t2);
			append_hydration(div0, t3);
			append_hydration(div0, input0);
			set_input_value(input0, /*recordId*/ ctx[0]);
			append_hydration(div2, t4);
			append_hydration(div2, div1);
			append_hydration(div1, label1);
			append_hydration(label1, t5);
			append_hydration(div1, t6);
			append_hydration(div1, input1);
			set_input_value(input1, /*taskName*/ ctx[1]);
			append_hydration(div14, t7);
			append_hydration(div14, div3);
			append_hydration(div3, label2);
			append_hydration(label2, t8);
			append_hydration(div3, t9);
			append_hydration(div3, textarea);
			set_input_value(textarea, /*taskDescription*/ ctx[2]);
			append_hydration(div14, t10);
			append_hydration(div14, div6);
			append_hydration(div6, div4);
			append_hydration(div4, label3);
			append_hydration(label3, t11);
			append_hydration(div4, t12);
			append_hydration(div4, select0);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				if (each_blocks_1[i]) {
					each_blocks_1[i].m(select0, null);
				}
			}

			select_option(select0, /*status*/ ctx[5], true);
			append_hydration(div6, t13);
			append_hydration(div6, div5);
			append_hydration(div5, label4);
			append_hydration(label4, t14);
			append_hydration(div5, t15);
			append_hydration(div5, select1);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(select1, null);
				}
			}

			select_option(select1, /*priority*/ ctx[6], true);
			append_hydration(div14, t16);
			append_hydration(div14, div10);
			append_hydration(div10, div7);
			append_hydration(div7, label5);
			append_hydration(label5, t17);
			append_hydration(div7, t18);
			append_hydration(div7, input2);
			set_input_value(input2, /*assignee*/ ctx[7]);
			append_hydration(div10, t19);
			append_hydration(div10, div8);
			append_hydration(div8, label6);
			append_hydration(label6, t20);
			append_hydration(div8, t21);
			append_hydration(div8, input3);
			set_input_value(input3, /*startDate*/ ctx[8]);
			append_hydration(div10, t22);
			append_hydration(div10, div9);
			append_hydration(div9, label7);
			append_hydration(label7, t23);
			append_hydration(div9, t24);
			append_hydration(div9, input4);
			set_input_value(input4, /*dueDate*/ ctx[9]);
			append_hydration(div14, t25);
			append_hydration(div14, div13);
			append_hydration(div13, div11);
			append_hydration(div11, label8);
			append_hydration(label8, t26);
			append_hydration(div11, t27);
			append_hydration(div11, input5);
			set_input_value(input5, /*clickupApiKey*/ ctx[3]);
			append_hydration(div13, t28);
			append_hydration(div13, div12);
			append_hydration(div12, label9);
			append_hydration(label9, t29);
			append_hydration(div12, t30);
			append_hydration(div12, input6);
			set_input_value(input6, /*clickupListId*/ ctx[4]);
			append_hydration(div14, t31);
			append_hydration(div14, button);
			append_hydration(button, t32);
			append_hydration(div14, t33);
			if (if_block) if_block.m(div14, null);

			if (!mounted) {
				dispose = [
					listen(input0, "input", /*input0_input_handler*/ ctx[16]),
					listen(input1, "input", /*input1_input_handler*/ ctx[17]),
					listen(textarea, "input", /*textarea_input_handler*/ ctx[18]),
					listen(select0, "change", /*select0_change_handler*/ ctx[19]),
					listen(select1, "change", /*select1_change_handler*/ ctx[20]),
					listen(input2, "input", /*input2_input_handler*/ ctx[21]),
					listen(input3, "input", /*input3_input_handler*/ ctx[22]),
					listen(input4, "input", /*input4_input_handler*/ ctx[23]),
					listen(input5, "input", /*input5_input_handler*/ ctx[24]),
					listen(input6, "input", /*input6_input_handler*/ ctx[25]),
					listen(button, "click", /*createClickUpTask*/ ctx[14])
				];

				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			if (dirty & /*recordId*/ 1 && input0.value !== /*recordId*/ ctx[0]) {
				set_input_value(input0, /*recordId*/ ctx[0]);
			}

			if (dirty & /*taskName*/ 2 && input1.value !== /*taskName*/ ctx[1]) {
				set_input_value(input1, /*taskName*/ ctx[1]);
			}

			if (dirty & /*taskDescription*/ 4) {
				set_input_value(textarea, /*taskDescription*/ ctx[2]);
			}

			if (dirty & /*clickupStatuses*/ 4096) {
				each_value_1 = /*clickupStatuses*/ ctx[12];
				let i;

				for (i = 0; i < each_value_1.length; i += 1) {
					const child_ctx = get_each_context_1(ctx, each_value_1, i);

					if (each_blocks_1[i]) {
						each_blocks_1[i].p(child_ctx, dirty);
					} else {
						each_blocks_1[i] = create_each_block_1(child_ctx);
						each_blocks_1[i].c();
						each_blocks_1[i].m(select0, null);
					}
				}

				for (; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].d(1);
				}

				each_blocks_1.length = each_value_1.length;
			}

			if (dirty & /*status, clickupStatuses*/ 4128) {
				select_option(select0, /*status*/ ctx[5]);
			}

			if (dirty & /*clickupPriorities*/ 8192) {
				each_value = /*clickupPriorities*/ ctx[13];
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(select1, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}

			if (dirty & /*priority, clickupPriorities*/ 8256) {
				select_option(select1, /*priority*/ ctx[6]);
			}

			if (dirty & /*assignee*/ 128 && to_number(input2.value) !== /*assignee*/ ctx[7]) {
				set_input_value(input2, /*assignee*/ ctx[7]);
			}

			if (dirty & /*startDate*/ 256) {
				set_input_value(input3, /*startDate*/ ctx[8]);
			}

			if (dirty & /*dueDate*/ 512) {
				set_input_value(input4, /*dueDate*/ ctx[9]);
			}

			if (dirty & /*clickupApiKey*/ 8 && input5.value !== /*clickupApiKey*/ ctx[3]) {
				set_input_value(input5, /*clickupApiKey*/ ctx[3]);
			}

			if (dirty & /*clickupListId*/ 16 && input6.value !== /*clickupListId*/ ctx[4]) {
				set_input_value(input6, /*clickupListId*/ ctx[4]);
			}

			if (dirty & /*loading*/ 2048 && t32_value !== (t32_value = (/*loading*/ ctx[11] ? 'Creating...' : 'Create Task') + "")) set_data(t32, t32_value);

			if (dirty & /*loading*/ 2048) {
				button.disabled = /*loading*/ ctx[11];
			}

			if (/*response*/ ctx[10]) {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block(ctx);
					if_block.c();
					if_block.m(div14, null);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(div14);
			destroy_each(each_blocks_1, detaching);
			destroy_each(each_blocks, detaching);
			if (if_block) if_block.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;
	let recordId = '';
	let taskName = '';
	let taskDescription = '';
	let clickupApiKey = '';
	let clickupListId = '';
	let status = 'Open';
	let priority = 'Normal';
	let assignee = '';
	let startDate = '';
	let dueDate = '';
	let response = '';
	let loading = false;
	const clickupStatuses = ['Open', 'In Progress', 'Review', 'Closed', 'To do'];
	const clickupPriorities = ['Urgent', 'High', 'Normal', 'Low'];

	async function createClickUpTask() {
		$$invalidate(11, loading = true);
		$$invalidate(10, response = '');

		const clickupTask = {
			name: taskName,
			description: taskDescription,
			status: status.toLowerCase(),
			priority: clickupPriorities.indexOf(priority) + 1,
			assignees: assignee ? [parseInt(assignee)] : [],
			start_date: startDate ? new Date(startDate).getTime() : null,
			due_date: dueDate ? new Date(dueDate).getTime() : null
		};

		const clickupUrl = `https://api.clickup.com/api/v2/list/${clickupListId}/task`;

		try {
			const result = await fetch(clickupUrl, {
				method: 'POST',
				headers: {
					'Authorization': clickupApiKey,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(clickupTask)
			});

			if (result.ok) {
				$$invalidate(10, response = 'Task successfully created in ClickUp.');
			} else {
				$$invalidate(10, response = `Error: ${result.status} ${result.statusText}`);
			}
		} catch(error) {
			$$invalidate(10, response = `Error: ${error.message}`);
		} finally {
			$$invalidate(11, loading = false);
		}
	}

	function input0_input_handler() {
		recordId = this.value;
		$$invalidate(0, recordId);
	}

	function input1_input_handler() {
		taskName = this.value;
		$$invalidate(1, taskName);
	}

	function textarea_input_handler() {
		taskDescription = this.value;
		$$invalidate(2, taskDescription);
	}

	function select0_change_handler() {
		status = select_value(this);
		$$invalidate(5, status);
		$$invalidate(12, clickupStatuses);
	}

	function select1_change_handler() {
		priority = select_value(this);
		$$invalidate(6, priority);
		$$invalidate(13, clickupPriorities);
	}

	function input2_input_handler() {
		assignee = to_number(this.value);
		$$invalidate(7, assignee);
	}

	function input3_input_handler() {
		startDate = this.value;
		$$invalidate(8, startDate);
	}

	function input4_input_handler() {
		dueDate = this.value;
		$$invalidate(9, dueDate);
	}

	function input5_input_handler() {
		clickupApiKey = this.value;
		$$invalidate(3, clickupApiKey);
	}

	function input6_input_handler() {
		clickupListId = this.value;
		$$invalidate(4, clickupListId);
	}

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(15, props = $$props.props);
	};

	return [
		recordId,
		taskName,
		taskDescription,
		clickupApiKey,
		clickupListId,
		status,
		priority,
		assignee,
		startDate,
		dueDate,
		response,
		loading,
		clickupStatuses,
		clickupPriorities,
		createClickUpTask,
		props,
		input0_input_handler,
		input1_input_handler,
		textarea_input_handler,
		select0_change_handler,
		select1_change_handler,
		input2_input_handler,
		input3_input_handler,
		input4_input_handler,
		input5_input_handler,
		input6_input_handler
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, { props: 15 });
	}
}

export { Component as default };
