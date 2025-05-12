import { createApp } from "vue";
import { GraffitiRemote } from "@graffiti-garden/implementation-remote";
import { GraffitiPlugin, useGraffitiDiscover } from "@graffiti-garden/wrapper-vue";


const AvatarIcon = {
  name: "AvatarIcon",
  props: {
    src:  { type: String, default: "" },
    alt:  { type: String, default: "Avatar" },
    size: { type: [Number, String], default: 32 }
  },
  template: `
    <img
      :src="src || './individualavatar.png'"
      :alt="alt"
      :width="size"
      :height="size"
      class="avatar-icon"
    />
  `
};

const app = createApp({

  data() {
    return {
      myMessage: "",
      sending: false,
      groupName: "",
      selectedChannel: null,
      selectedGroup: null,
      editingMessage: null,
      editContent: "",
      newGroupName: "",
      groupNameObjects: [],
      activeMenu: null,
      showGroupInfo: false,
      groupDescriptionsByGroup: {},
      groupMembers: [],
      isLoggedIn: false,
      showProfile: false,
      profileForm: {
        name: "",
        pronouns: "",
        bio: "",
        picture: "./individualavatar.png"
      },
      profileObjects: [],
      showInviteModal: false,
      inviteActor: "",
      membersObjects: [],
      showGroupDropdown: false,
      showCreateForm: false,
      showTaskAssignment: false,
      taskListsByGroup: {},  
      taskNotesByGroup: {}, 
      rawMessages: [],
      pendingDeletes: [],   // { type:'message'|'task', item, timer }[]
      toast: null,
      hiddenMessageIds: new Set(),
      isLoading: false,
      loaderId: null,
      groupsLoaded: false, 
      profileLoaded: false,
      messagesLoaded: false, 
      lastLinesByChannel: Object.create(null),
      groupMembersByChannel: {},
      groupChatObjects: [],
    };
  },


  setup() {
        const {objects: usersObjects} = useGraffitiDiscover(
          ['users'],
          {
                properties: {
                value: {
                    required: ['activity'],
                    properties: {
                    activity: { const: 'Login' }
                    },
                    required: ["activity"]
                }
                }
            }
        );
        return { usersObjects }
  },


  methods: {
    async login() {
      await this.$graffiti.login();
      console.log("🪪 Login dialog closed.");
    },
    
    addTask() {
      this.taskList = [
        ...this.taskList,
        { text: "", assignedTo: "", done: false }
      ];
    },

    updateTaskState(objects) {
      if (this.showTaskAssignment) return

      if (!Array.isArray(objects) || !this.selectedChannel) return;
      const mine = objects.filter(o => o.value.activity === 'Tasks');
      if (!mine.length) return;
      const latest = mine.reduce((a, b) =>
        (a.value.published ?? 0) > (b.value.published ?? 0) ? a : b
      );
    
      this.taskListsByGroup[this.selectedChannel] = latest.value.tasks || [];
      this.taskNotesByGroup[this.selectedChannel] = latest.value.notes || "";
      console.log("Loaded tasks via graffiti-discover:", latest.value);
    },
    
    removeTask(index) {
      const task = this.taskList[index];
      this.taskList = this.taskList.filter((_, i) => i !== index);
    
      const record = { item: task, timerId: null };
    
      record.timerId = setTimeout(() => {
        this.saveTasks();                           // commit list without task
        this.pendingDeletes = this.pendingDeletes.filter(r => r !== record);
      }, 5000);
    
      this.pendingDeletes.push(record);
    
      this.showUndoToast("Task deleted", () => {
        clearTimeout(record.timerId);
        this.pendingDeletes = this.pendingDeletes.filter(r => r !== record);
        this.taskList = [...this.taskList, task];   // restore
        this.toast = null;
      });
    },
    
    async saveTasks() {
      if (!this.selectedChannel) return;

      await this.$graffiti.put({
        channels: [this.selectedChannel],
        value: {
          activity: "Tasks",
          notes: this.taskNotes,
          tasks: this.taskList,
          published: Date.now()
        }
      }, this.$graffitiSession.value);

      alert("Tasks saved!");
    },
    
    async loadTasks() {
    // if (!this.selectedChannel) return;
    
    // const res = await this.$graffiti.query({
    //   channels: [this.selectedChannel],
    //   filters: [{ field: "value.activity", equals: "Tasks" }]
    // });
    // grab the graffiti session
      const session = this.$graffitiSession.value;
      if (!this.selectedChannel || !session?.store) {
        console.warn("No channel or no graffiti store available");
        return;
      }
      // query via the session's store
      const res = await session.store.query({
        channels: [this.selectedChannel],
        filters: [{ field: "value.activity", equals: "Tasks" }]
      });
        
      if (!res.objects.length) {
        this.taskList = [];
        this.taskNotes = "";
        console.log("No saved tasks for", this.selectedChannel);
        return;
      }
    
      const latest = res.objects.reduce((a, b) =>
        a.value.published > b.value.published ? a : b
      );
    
      console.log("Loaded tasks for", this.selectedChannel, latest);
      this.taskList = latest.value.tasks || [];
      this.taskNotes = latest.value.notes || "";
      },

    toggleMessageMenu(message) {
      this.activeMenu = this.activeMenu === message ? null : message;
    },
    toggleGroupDropdown() {
      this.showGroupDropdown = !this.showGroupDropdown;
    },
    async sendMessage(session) {
      if (!this.myMessage || !this.selectedChannel) return;
      this.sending = true;
      await this.$graffiti.put(
        {
          value: {
            content: this.myMessage,
            published: Date.now(),
            
          },
          channels: [this.selectedChannel],
        },
        session
      );
      this.myMessage = "";
      this.sending = false;
      await this.$nextTick();
      this.$refs.messageInput.focus();
    },

    onEnter() {
      this.sendMessage(this.$graffitiSession.value);
    },

    async createGroup(session) {
        const newChannel = crypto.randomUUID();

        // First: create the group
        await this.$graffiti.put(
          {
            value: {
              activity: "Create",
              object: {
                type: "Group Chat",
                name: this.groupName,
                channel: newChannel,
              },
            },
            channels: ['channelsPlanChat'],
          },
          session
        );
        
        // Then: publish the name-binding object
        await this.$graffiti.put(
          {
            value: {
              name: this.groupName,
              describes: newChannel,
            },
            channels: ['channelsPlanChat'],
          },
          session
        );
        this.groupMembers = [this.currentActor];

        await this.$graffiti.put({
          channels: [ newChannel ],
          value: {
            activity:  'Members',
            members:   this.groupMembers,
            published: Date.now()
          }
        }, session);

        this.selectedChannel = newChannel;
        this.groupName = "";
        groupMenu.classList.add('hidden');
        this.showCreateForm    = false;   // hide the form
        this.showGroupDropdown = false;
    },

    async saveDescription() {
      if (!this.selectedChannel) return;
    
      await this.$graffiti.put({
        channels: [this.selectedChannel],
        value: {
          activity:  "Description",
          text:      this.groupDescription,
          published: Date.now()
        }
      }, this.$graffitiSession.value);
    
      alert("Description saved!");
    },

    updateDescriptionState(objects) {
      if (!Array.isArray(objects) || !this.selectedChannel) return;
  
      const mine = objects.filter(o => o.value.activity === "Description");
      if (!mine.length) return;
  
      const latest = mine.reduce((a, b) =>
        (a.value.published ?? 0) > (b.value.published ?? 0) ? a : b
      );
  
      this.groupDescriptionsByGroup[this.selectedChannel] = latest.value.text || "";
    },

    startEdit(message) {
      this.editingMessage = message;
      this.editContent = message.value.content;
    },

    cancelEdit() {
      this.editingMessage = null;
      this.editContent = "";
    },

    async saveEdit(message) {
      await this.$graffiti.patch(
        {
          value: [
            {
              op: "replace",
              path: "/content",
              value: this.editContent,
            },
          ],
        },
        message,
        this.$graffitiSession.value
      );
      this.editingMessage = null;
      this.editContent = "";
    },

    async deleteMessage(message) {
      this.hiddenMessageIds.add(message.url);
      /* 2 ▪ create a record that keeps its own timerId */
      const record = {
        item: message,
        timerId: null
      };
    
      record.timerId = setTimeout(() => {
        // irreversible delete after 5 s
        this.$graffiti.delete(message, this.$graffitiSession.value);
        this.pendingDeletes = this.pendingDeletes.filter(r => r !== record);
        this.hiddenMessageIds.delete(message.url);
      }, 5000);
    
      this.pendingDeletes.push(record);
    
      /* 3 ▪ toast with a rock-solid Undo */
      this.showUndoToast("Message deleted", () => {
        clearTimeout(record.timerId);
        this.pendingDeletes = this.pendingDeletes.filter(r => r !== record);
        this.hiddenMessageIds.delete(message.url);
        this.toast = null;
      });
    },

    async renameGroup() {
      if (!this.newGroupName.trim() || !this.selectedChannel) return;
    
      this.isLoading = true;                 
      try {
        await this.$graffiti.put(
          {
            value: {
              name: this.newGroupName.trim(),
              describes: this.selectedChannel
            },
            channels: ["channelsPlanChat"]
          },
          this.$graffitiSession.value
        );
    
        this.newGroupName = "";
      } catch (err) {
        console.error(err);
        alert("Could not rename the group.");
      } finally {
        this.isLoading = false;              
      }
    },


    showLoader() {
      clearTimeout(this.loaderId);
      this.loaderId = setTimeout(() => (this.isLoading = true), 250);
    },
    /** hide immediately */
    hideLoader() {
      clearTimeout(this.loaderId);
      this.isLoading = false;
    },

    getGroupName(channel) {
        const matches = this.groupNameObjects
          .filter((obj) => obj.value.describes === channel);
      
        if (matches.length === 0) return null;

        const latest = matches.reduce((a, b) => {
          const aTime = a.value.published ?? a.timestamp ?? 0;
          const bTime = b.value.published ?? b.timestamp ?? 0;
          return aTime > bTime ? a : b;
        });
      
        return latest.value.name;
    },

    updateGroupNameObjects(objs) {
      this.groupNameObjects = objs;
    },

    async saveProfile() {
      if (!this.currentActor) return;
      const profileObj = {
        name:      this.profileForm.name,
        pronouns:  this.profileForm.pronouns,
        bio:       this.profileForm.bio,
        picture:   this.profileForm.picture,     
        describes: this.currentActor,
        published: Date.now(),
        generator: "https://username.github.io/your-app/",
      };
      await this.$graffiti.put(
        { value: profileObj, generator: "https://username.github.io/your-app/", channels: [ this.currentActor, "designftw-2025-studio2" ] },
        this.$graffitiSession.value
      );
      alert("¡Profile Saved!");
      this.showProfile = false;
    },

    async loadProfile() {
      if (!this.currentActor || !this.$graffitiSession.value?.store) return;
    
      const res = await this.$graffitiSession.value.store.query({
        channels: [this.currentActor]
      });
    
      const objs = res.objects.filter(
        (o) => o.value.describes === this.currentActor
      );
    
      if (!objs.length) return;
    
      const latest = objs.reduce((a, b) =>
        a.value.published > b.value.published ? a : b
      );
    
      this.profileForm.name     = latest.value.name;
      this.profileForm.pronouns = latest.value.pronouns;
      this.profileForm.bio      = latest.value.bio;
      this.profileForm.picture  = latest.value.picture ?? "./individualavatar.png";
    },

    onFileChange(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        this.profileForm.picture = e.target.result;  // data URL
      };
      reader.readAsDataURL(file);
    },

    async recordLogin(session) {
      await this.$graffiti.put({
        value: {
          activity: "Login",
          actor:    session.actor,
          published: Date.now()
        },
        channels: ["users"],
      }, session);
      console.log("Actor logged in:", session.value.actor);
    },

    openInvite() {
      this.inviteActor = "";
      this.showInviteModal = true;
    },
    closeInvite() {
      this.showInviteModal = false;
      this.inviteActor = "";
    },

    async sendInvite() {
      const entered = this.inviteActor.trim();
    
      if (!entered) {
        return alert("Please enter a valid username");
      }
    
      const fullWebId = this.allUsers.find(u => this.shortName(u) === entered) || entered;

      // Check if the fullWebId is a known user
      const exists = this.allUsers.includes(fullWebId);
      if (!exists) {
        return alert(`User “${entered}” not found.`);
      }

      if (this.groupMembers.includes(fullWebId)) {
        return alert(`User “${entered}” is already in the group.`);
      }
    
      await this.$graffiti.put({
        value: {
          activity: "Invite",
          group: this.selectedChannel,
          from: this.currentActor,
          published: Date.now()
        },
        channels: [fullWebId]
      }, this.$graffitiSession.value);
    
      this.groupMembers.push(fullWebId);
      await this.saveGroupMembers();

      alert(`Invitation sent to ${entered}`);
      this.closeInvite();
    },

    shortName(uri) {
      try {
        return new URL(uri).pathname.replace(/^\/+/, '');
      } catch {
        return uri;
      }
    },

    async saveGroupMembers() {
      if (!this.selectedChannel) return;
      await this.$graffiti.put({
        channels: [ this.selectedChannel ],
        value: {
          activity:  'Members',
          members:   this.groupMembers,
          published: Date.now()
        }
      }, this.$graffitiSession.value);
    },
  
    
    updateMembers(objects, channel) {
    // 1️⃣ filter out only “Members” events
      const membersEvents = Array.isArray(objects)
        ? objects.filter(o => o.value.activity === 'Members')
        : [];

      if (!membersEvents.length) return;

      // 2️⃣ pick the latest
      const latest = membersEvents.reduce((a, b) =>
        (a.value.published > b.value.published ? a : b)
      );
      const newList = Array.isArray(latest.value.members)
        ? latest.value.members
        : [];

      // 3️⃣ compare to what we have
      const oldList = this.groupMembersByChannel[channel] || [];
      const same = oldList.length === newList.length
        && oldList.every((v,i) => v === newList[i]);
      if (same) return;    // no change → no rewrite

      // 4️⃣ write only on real change (breaks any recursion)
      this.groupMembersByChannel = {
        ...this.groupMembersByChannel,
        [channel]: newList
      };
    },

    memberAvatar(objects) {
      if (!objects.length) {
        return './individualavatar.png';
      }
      const latest = objects.reduce((a, b) =>
        a.value.published > b.value.published ? a : b
      );
      return latest.value.picture || './individualavatar.png';
    }, 

    showUndoToast(text, undoFn) {
      // clear any existing toast
      if (this.toast?.hideId) clearTimeout(this.toast.hideId);

      const hideId = setTimeout(() => (this.toast = null), 5000);

      this.toast = { text, undo: undoFn, hideId };
    },

    
    lastLine(objects) {
      if (!Array.isArray(objects) || objects.length === 0) return "";
      const newest = objects.reduce((a, b) =>
        (a.value.published ?? 0) > (b.value.published ?? 0) ? a : b
      );
      const author  = this.shortName(newest.actor);
      const content = newest.value.content?.trim() ?? "";
      // keep it short – 40 chars max
      const snippet = content.length > 40 ? content.slice(0, 37) + "…" : content;
      return `${author}: ${snippet}`;
    },

    async refreshLastLine(channel) {
      const store = this.$graffitiSession.value?.store;
      if (!store) return;

      // ask for just messages that have content + published
      const res = await store.query({
        channels: [channel],
        filters: [{ field: 'value.content', exists: true }],
      });

      if (!res.objects.length) {
        this.$set(this.lastLinesByChannel, channel, '');
        return;
      }

      // newest = greatest published (or timestamp fallback)
      const newest = res.objects.reduce((a, b) =>
        (a.value.published ?? a.timestamp ?? 0) >
        (b.value.published ?? b.timestamp ?? 0) ? a : b
      );

      const author  = this.shortName(newest.actor);
      const content = (newest.value.content || '').trim();
      const snippet = content.length > 40 ? content.slice(0, 37) + '…' : content;

      this.$set(this.lastLinesByChannel, channel, `${author}: ${snippet}`);
    },
    
    handlePollingDone(initialPolling) {
      if (initialPolling) return;                    // still polling
      if (this.messagesLoaded) return;       // already hid

      this.messagesLoaded = true;            // mark complete
      this.hideLoader();                     // hide overlay
    },

    isMember(channel) {
      const list = this.groupMembersByChannel[channel] || [];
      return list.includes(this.currentActor);
    },

    // fetch **once** per channel, keep only the newest “Members” object
    

  },

  watch: {
     $graffitiSession(session) {
      this.loadProfile();
    },
    selectedChannel(newChan, oldChan) {
      if (newChan && newChan !== oldChan) {
        this.showLoader();
        this.messagesLoaded = false;
        this.rawMessages = [];

        const stopLen = this.$watch(
          () => this.rawMessages.length,
          len => {
            if (len > 0) {
              this.messagesLoaded = true;
              this.hideLoader();
              stopLen();
              clearTimeout(failSafe);
            }
          },
          { immediate:false }
        );

        // NEW: fail-safe – hide after 4 s if still empty
        const failSafe = setTimeout(() => {
          if (!this.messagesLoaded) {
            this.hideLoader();
            stopLen();
          }
        }, 4000);
      }

      if (newChan) this.loadTasks();
    },

    $graffitiSession: {
      handler(session) {
        const actor = session?.value?.actor;
        const store = session?.value?.store;
        if (!actor || !store) return;

        console.log("✅ Session available with store");

        // fetch members for all known channels
        const channels = this.groupNameObjects
          .map(o => o.value?.object?.channel ?? o.value?.describes)
          .filter(Boolean);

        channels.forEach(ch => {
          if (!(ch in this.lastLinesByChannel)) {
            this.refreshLastLine(ch);
          }
        });

        // already existing logic
        const alreadyLogged = this.usersObjects.some(
          (obj) => obj.value?.actor === actor
        );

        if (!alreadyLogged) {
          this.$graffiti.put({
            value: {
              activity: "Login",
              actor,
              published: Date.now()
            },
            channels: ["users"]
          }, session.value).then(() => {
            console.log("📝 Login recorded for:", actor);
          });
        }

        this.loadProfile();
      },
      immediate: true
    },
    currentActor(newA, oldA) {
      if (newA && newA !== oldA) {
        this.profileForm = { name: "", pronouns: "", bio: "", picture: "" };
        this.profileObjects = [];
      }
    },
    profileObjects(objs) {
      if (!objs?.length) return;
      const mine = objs.filter(o => o.value.describes === this.currentActor);
      if (!mine.length) return;
      const latest = mine.reduce((a,b) =>
        a.value.published > b.value.published ? a : b
      );
      Object.assign(this.profileForm, {
        name:     latest.value.name,
        pronouns: latest.value.pronouns,
        bio:      latest.value.bio,
        picture:  latest.value.picture || ""
      });
    },

    membersObjects: {
        handler(objs) {
          this.updateMembers(Array.isArray(objs) ? objs : []);
        },
        immediate: true
    },

    showGroupInfo(newVal) {
      if (newVal) {
        /* user just opened the info panel */
        if (!this.selectedGroup?.value.object.description) {
          this.showLoader();
          /* wait until description appears or 5 s pass */
          const stop = this.$watch(
            () => this.selectedGroup?.value.object.description,
            desc => {
              if (desc) { this.hideLoader(); stop(); }
            },
            { immediate: true }
          );
          setTimeout(() => { this.hideLoader(); stop(); }, 5000);
        }
      } else {
        /* panel closed */
        this.hideLoader();
      }
    },

    '$graffitiSession.value.actor': {
      immediate: false,
      handler(actor, old) {
        if (actor && actor !== old) {
          // show spinner, but FIRST see if data is already cached
      this.showLoader();
          
      // mark as loaded immediately if the arrays are already present
      if (this.groupNameObjects.length) {
             this.groupsLoaded = true;
           }
           if (this.profileObjects.some(
                 o => o.value.describes === actor)) {
             this.profileLoaded = true;
           }
      
      if (this.groupsLoaded && this.profileLoaded) {
        this.hideLoader();      // everything was cached – hide right away
      }          // ← now it exists
        } else if (!actor) {
          this.hideLoader();
        }
      }
    }, 

    groupNameObjects: {
      immediate: true,
      handler(objs) {
        this.groupNameObjects = objs;
      }
    },


    // refresh the preview when *any* new message arrives
    rawMessages(newMsgs) {
      if (this.selectedChannel) {
        this.refreshLastLine(this.selectedChannel);
      }
    },

    $graffitiSession: {
      handler(s) {
        if (!s?.store) return;
        // fetch memberships for every known channel once the store is ready

      },
      immediate: true
    },
  },

  computed: {
    currentActor() {
      return this.$graffitiSession.value?.actor ?? null;
    },
    allUsers() {
      return Array.isArray(this.usersObjects)
          ? this.usersObjects.map((o) => o.actor? o.actor : '')
          : [];
    },
    setUsers() {
      return new Set(this.allUsers);
    },
    formattedUsers() {
      return Array.from(this.setUsers).map(actor => {
        let display;
        try {
          const url = new URL(actor);
          display = url.pathname.replace(/^\/+/, ''); // get user from URL
        } catch {
          display = actor;
        }
        return display;
      });
    }, 
    taskList: {
      get() {
        return this.taskListsByGroup[this.selectedChannel] || [];
      },
      set(val) {
        this.taskListsByGroup = {
          ...this.taskListsByGroup,
          [this.selectedChannel]: val
        };
      }
    },
    taskNotes: {
      get() {
        return this.taskNotesByGroup[this.selectedChannel] || "";
      },
      set(val) {
        this.taskNotesByGroup = {
          ...this.taskNotesByGroup,
          [this.selectedChannel]: val
        };
      }
    },
    sortedMessages() {
        return [...(this.rawMessages || [])]
          .filter(m => !this.hiddenMessageIds.has(m.url))      
          .sort((a, b) => (a.value.published ?? 0) - (b.value.published ?? 0));
    }, 

    groupDescription: {
      get() {
        return this.groupDescriptionsByGroup[this.selectedChannel] || "";
      },
      set(val) {
        this.groupDescriptionsByGroup = {
          ...this.groupDescriptionsByGroup,
          [this.selectedChannel]: val
        };
      }
    }, 

    filteredGroupChatObjects() {
      console.log(this.groupMembersByChannel);
      return this.groupChatObjects.filter(g => {
        const members = this.groupMembersByChannel[g.value.object.channel] || [];
        return members.includes(this.currentActor);
      });
    },
  },

  mounted() {

    // 1️⃣  Hoisted helper (function declaration is hoisted)
    const maybeHideGlobal = () => {
      if (this.groupsLoaded && this.profileLoaded) {
        console.log('both done');
        this.hideLoader();}
    };

    // 2️⃣  Now the watchers can safely call it
    this.$watch(                                       // GROUP LIST
      () => this.groupNameObjects.length,              // ← reactive
      len => {
        if (len) {
          console.log('groups loaded');
          this.groupsLoaded = true;
          maybeHideGlobal();
        }
      },
      { immediate: true }
    );
    
    this.$watch(                                       // PROFILE
      () => this.profileObjects.some(
            o => o.value.describes === this.currentActor),
      loaded => {
        if (loaded) {
          console.log('profile loaded');
          this.profileLoaded = true;
          maybeHideGlobal();
        }
      },
      { immediate: true }
    );



    this.loadProfile();
    const unwatch = this.$watch(
      () => this.$refs.groupNameDiscover?.$data?.objects,
      (newObjects) => {
        if (newObjects) {
          this.groupNameObjects = newObjects;
          newObjects.forEach(obj => {
            const ch = obj.value?.object?.channel ?? obj.value?.describes;

          });
        }
      },
      { immediate: true }
      
    );
    
    this.$watch(
      () => this.$refs.profileDiscover?.$data.objects,
      (objs) => {
        if (!objs || objs.length === 0) return;
        const latest = objs.reduce((a, b) =>
          (a.value.published > b.value.published ? a : b)
        );
        this.profileForm.name     = latest.value.name;
        this.profileForm.pronouns = latest.value.pronouns;
        this.profileForm.bio      = latest.value.bio;
      },
      { immediate: true }

    );

    this.$nextTick(() => {
      this.$watch(
        () => this.$refs.profileDiscover?.$data.objects,
        (objs) => {
          if (!objs?.length) return;
          const mine = objs.filter(
            (o) => o.value.describes === this.currentActor
          );
          if (!mine.length) return;
          const latest = mine.reduce((a, b) =>
            a.value.published > b.value.published ? a : b
          );

          this.profileForm.name     = latest.value.name;
          this.profileForm.pronouns = latest.value.pronouns;
          this.profileForm.bio      = latest.value.bio;
        },
        { immediate: true }
      );

      //const toggleMenuBtn = document.getElementById('toggleGroupMenu');
      const groupMenu = document.getElementById('groupMenu');
      const showCreateFormBtn = document.getElementById('showCreateForm');
      const createGroupForm = document.getElementById('createGroupForm');

      // if (toggleMenuBtn && groupMenu) {
      //   toggleMenuBtn.addEventListener('click', () => {
      //     groupMenu.classList.toggle('hidden');
      //   });
      // }

      if (showCreateFormBtn && groupMenu && createGroupForm) {
        showCreateFormBtn.addEventListener('click', () => {
          groupMenu.classList.add('hidden');
          createGroupForm.classList.toggle('hidden');
          createGroupForm.classList.toggle('showing');
        });
      }
    });

    const session = this.$graffitiSession.value;
    if (session) {
      this.recordLogin(session);}


    this.$watch(
      () => this.$refs.usersDiscover?.$data.objects,
      (objs) => {
        if (Array.isArray(objs)) {
          this.usersObjects = objs;
          console.log("🚀 usersObjects actualizados:", objs);
        }
      },
      { immediate: true }
    );

    this.$watch(
      () => this.$refs.membersDiscover?.$data.objects,
      (objs) => {
        this.updateMembers(Array.isArray(objs) ? objs : []);
      },
      { immediate: true }
    );

    this.$watch(
      () => this.$graffitiSession.value?.actor,
      (newActor, oldActor) => {
        if (newActor && newActor !== oldActor) {
          console.log("✅ Actor logged in:", newActor);
  
          // Optionally log to 'users' channel
          const alreadyLogged = this.usersObjects.some(
            (obj) => obj.value?.actor === newActor
          );
  
          if (!alreadyLogged) {
            this.$graffiti.put({
              value: {
                activity: "Login",
                actor: newActor,
                published: Date.now()
              },
              channels: ["users"]
            }, this.$graffitiSession.value).then(() => {
              console.log("📝 Login recorded for:", newActor);
            });
          }
  
          this.loadProfile();
        }
      },
      { immediate: true }
    );
  },


});

app.component("avatar-icon", AvatarIcon);

app
  .use(GraffitiPlugin, {
    graffiti: new GraffitiRemote(),
  })
  .mount("#app");


