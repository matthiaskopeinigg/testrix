import { describe, expect, it } from 'vitest';

import {
  deviceNodeCenter,
  findDeviceNode,
  findDeviceNodeAtPoint,
  formatDeviceSelector,
  parseDeviceHierarchy,
  parseDeviceSelector,
} from './device-hierarchy';

const DUMP = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node text="" resource-id="" class="android.widget.FrameLayout" package="org.app" clickable="false" bounds="[0,0][1080,1920]">
    <node text="Save" resource-id="org.app:id/save" content-desc="Save changes" class="android.widget.Button" package="org.app" clickable="true" bounds="[100,200][300,280]" />
    <node text="Email" resource-id="org.app:id/email" content-desc="" class="android.widget.EditText" package="org.app" clickable="true" bounds="[80,400][1000,480]" />
  </node>
</hierarchy>`;

describe('parseDeviceHierarchy', () => {
  it('reads nested uiautomator nodes and finds by selector', () => {
    const roots = parseDeviceHierarchy(DUMP);
    expect(roots).toHaveLength(1);
    expect(roots[0]?.children).toHaveLength(2);
    const save = findDeviceNode(roots, parseDeviceSelector('id=org.app:id/save'));
    expect(save?.text).toBe('Save');
    expect(deviceNodeCenter(save!)).toEqual({ x: 200, y: 240 });
    expect(findDeviceNode(roots, parseDeviceSelector('text=Email'))?.className).toBe(
      'android.widget.EditText',
    );
    expect(findDeviceNode(roots, parseDeviceSelector('desc=Save changes'))?.resourceId).toBe(
      'org.app:id/save',
    );
  });

  it('formats selectors and resolves a click point to the smallest node', () => {
    const roots = parseDeviceHierarchy(DUMP);
    const save = findDeviceNode(roots, parseDeviceSelector('id=org.app:id/save'))!;
    expect(formatDeviceSelector(save)).toBe('id=org.app:id/save');
    expect(formatDeviceSelector({ ...save, resourceId: '', text: '' })).toBe('desc=Save changes');
    const hit = findDeviceNodeAtPoint(roots, 200, 240);
    expect(hit?.resourceId).toBe('org.app:id/save');
    expect(findDeviceNodeAtPoint(roots, 10, 10)).toBeNull();
    expect(findDeviceNodeAtPoint(roots, 5000, 5000)).toBeNull();
  });

  it('treats a bare Android resource-id as id=, not text', () => {
    const roots = parseDeviceHierarchy(DUMP);
    expect(parseDeviceSelector('org.app:id/save')).toEqual({ resourceId: 'org.app:id/save' });
    expect(findDeviceNode(roots, parseDeviceSelector('org.app:id/email'))?.text).toBe('Email');
    expect(findDeviceNode(roots, parseDeviceSelector('id=org.app:id/save'))?.text).toBe('Save');
  });

  it('disambiguates duplicate inputs with ;index=N', () => {
    const roots = parseDeviceHierarchy(`<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node text="" resource-id="" class="android.widget.FrameLayout" package="org.app" clickable="false" bounds="[0,0][1080,1920]">
    <node text="" resource-id="" class="android.widget.EditText" package="org.app" content-desc="" clickable="true" bounds="[80,400][1000,480]" />
    <node text="" resource-id="" class="android.widget.EditText" package="org.app" content-desc="" clickable="true" bounds="[80,520][1000,600]" />
  </node>
</hierarchy>`);
    const first = findDeviceNodeAtPoint(roots, 200, 440)!;
    const second = findDeviceNodeAtPoint(roots, 200, 560)!;
    expect(formatDeviceSelector(first, roots)).toBe('class=android.widget.EditText;index=0');
    expect(formatDeviceSelector(second, roots)).toBe('class=android.widget.EditText;index=1');
    expect(parseDeviceSelector('class=android.widget.EditText;index=1')).toEqual({
      className: 'android.widget.EditText',
      index: 1,
    });
    expect(findDeviceNode(roots, parseDeviceSelector('class=android.widget.EditText;index=1'))?.bounds).toEqual(
      second.bounds,
    );
    expect(findDeviceNode(roots, parseDeviceSelector('class=android.widget.EditText'))?.bounds).toEqual(
      first.bounds,
    );
  });

  it('picks a launcher icon instead of the full-screen content frame', () => {
    const roots = parseDeviceHierarchy(`<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node text="" resource-id="android:id/content" class="android.widget.FrameLayout" package="com.google.android.apps.nexuslauncher" content-desc="" clickable="false" bounds="[0,0][1080,2400]">
    <node text="" resource-id="" class="android.view.View" package="com.google.android.apps.nexuslauncher" content-desc="Home" clickable="false" bounds="[0,128][1080,2337]" />
    <node text="Gmail" resource-id="" class="android.widget.TextView" package="com.google.android.apps.nexuslauncher" content-desc="Gmail" clickable="true" bounds="[309,1479][519,1751]" />
    <node text="Photos" resource-id="" class="android.widget.TextView" package="com.google.android.apps.nexuslauncher" content-desc="Photos" clickable="true" bounds="[561,1479][771,1751]" />
  </node>
</hierarchy>`);
    expect(findDeviceNodeAtPoint(roots, 400, 1600)?.text).toBe('Gmail');
    expect(findDeviceNodeAtPoint(roots, 200, 400)).toBeNull();
    expect(formatDeviceSelector(findDeviceNodeAtPoint(roots, 650, 1600)!)).toBe('text=Photos');
  });
});
